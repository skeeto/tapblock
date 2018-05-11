const WIDTH_DEFAULT = 10;
const WIDTH_MIN = 4;
const WIDTH_MAX = 32;
const HEIGHT_DEFAULT = 16;
const HEIGHT_MIN = 4;
const HEIGHT_MAX = 64;
const COLORS_DEFAULT = 4;
const COLORS_MIN = 2;
const COLORS_MAX = 6;
const COLORS = new Float32Array([
    0.27, 0.27, 0.27,
    1.00, 0.35, 0.35,
    0.35, 1.00, 0.35,
    0.35, 0.35, 1.00,
    1.00, 1.00, 0.35,
    0.35, 1.00, 1.00,
    1.00, 0.55, 1.00,
]);
const CONNECT = [+1, +0, -1, +0, +0, +1, +0, -1];

/* Create a new random game state.
 */
function tapblock(w, h, n) {
    let g = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            g[y * w + x] = 1 + Math.floor(Math.random() * n);
        }
    }
    return {
        width: w,
        height: h,
        grid: g,
        inv: null,
        marked: new Uint8Array(w * h)
    };
}

/* Return true if (x, y) is within the bounds of the game grid.
 */
function inbounds(game, x, y) {
    return x >= 0 && x < game.width && y >= 0 && y < game.height;
}

/* Mark the connected blob under (x, y).
 * Returns the size of the blob.
 */
function mark(game, x, y) {
    let count = 0;
    function visit(x, y) {
        let k = y * game.width + x;
        if (game.grid[k] && !game.marked[k]) {
            game.marked[k] = 1;
            count++;
            for (let i = 0; i < CONNECT.length / 2; i++) {
                let nx = x + CONNECT[i * 2 + 0];
                let ny = y + CONNECT[i * 2 + 1];
                let nk = ny * game.width + nx;
                if (inbounds(game, nx, ny) && game.grid[k] === game.grid[nk])
                    visit(nx, ny);
            }
        }
    }

    game.marked.fill(0);
    x = Math.floor(x);
    y = Math.floor(y);
    if (inbounds(game, x, y))
        visit(x, y);

    if (count < 2) {
        game.marked.fill(0);
        count = 0;
    }
    return count;
}

/* Mark the selected blob under pixel coordinates (px, py).
 * Returns the size of the selected blob.
 */
function highlight(game, px, py) {
    let [x, y] = transform(game.inv, px, py);
    x = Math.floor(x);
    y = Math.floor(y);
    return mark(game, x, y);
}

/* Collapse the space vertically into (x, y).
 */
function gravity(game, x, y) {
    let w = game.width;
    let g = game.grid;
    let count;
    do {
        count = 0;
        for (let yy = y; yy > 0; yy--) {
            let v = g[(yy - 1) * w + x];
            g[yy * w + x] = v;
            count += !!v;
        }
        g[x] = 0;
    } while (!g[y * w + x] && count);
}

/* Collapse the space horizontally into column x.
 */
function shift(game, x) {
    let w = game.width;
    let h = game.height;
    let g = game.grid;
    let count;
    do {
        count = 0;
        for (let xx = x; xx < w - 1; xx++) {
            for (let y = 0; y < h; y++) {
                let d = y * w + xx;
                let s = y * w + xx + 1;
                g[d] = g[s];
            }
            count += !!g[(h - 1) * w + xx];
        }
        for (let y = 0; y < h; y++)
            g[y * w + w - 1] = 0;
    } while (count && !g[(h - 1) * w + x]);
}

/* Collapse all empty gaps in the game grid.
 */
function collapse(game) {
    let w = game.width;
    let h = game.height;
    let g = game.grid;
    for (let x = 0; x < w; x++) {
        for (let y = h - 1; y >= 0; y--) {
            let i = y * w + x;
            if (!g[i])
                gravity(game, x, y);
        }
    }

    for (let x = 0; x < w - 1; x++)
        if (!g[(h - 1) * w + x])
            shift(game, x);
}

/* Collapse the blob under the pixel coordinate (px, py).
 */
function clear(game, px, py) {
    let [x, y] = transform(game.inv, px, py);
    x = Math.floor(x);
    y = Math.floor(y);
    mark(game, x, y);
    for (let y = 0; y < game.height; y++) {
        for (let x = 0; x < game.width; x++) {
            let i = y * game.width + x;
            if (game.marked[i])
                game.grid[i] = 0;
        }
    }
    collapse(game);
}

/* Return true if there are no more moves left.
 */
function isdone(game) {
    for (let y = 0; y < game.height; y++)
        for (let x = 0; x < game.width; x++)
            if (mark(game, x, y))
                return false;
    return true;
}

/* Count the remaining blocks.
 */
function blocksleft(game) {
    let score = 0;
    for (let y = 0; y < game.height; y++)
        for (let x = 0; x < game.width; x++)
            score += !!game.grid[y * game.width + x];
    return score;
}

/* Convert normalized color (r, g, b) into a CSS value.
 */
function color(r, g, b) {
    return 'rgb(' + Math.round(r * 255) + ', ' +
                    Math.round(g * 255) + ', ' +
                    Math.round(b * 255) + ')';
}

/* Create an affine transformation matrix.
 * This matrix is suitable for the transform() method on a drawing
 * context.
 */
function affine(x, y, scale, rotate) {
    return new Float32Array([
        +Math.cos(rotate) * scale,
        +Math.sin(rotate) * scale,
        -Math.sin(rotate) * scale,
        +Math.cos(rotate) * scale,
        x,
        y
    ]);
}

/* Return the inversion of the given affine transformation matrix.
 */
function invert(m) {
    let cross = m[0] * m[3] - m[1] * m[2];
    return new Float32Array([
        +m[3] / cross,
        -m[1] / cross,
        -m[2] / cross,
        +m[0] / cross,
        -m[4],
        -m[5]
    ]);
}

/* Apply the affine transformation to (x, y).
 */
function transform(m, x, y) {
    let xx = x + m[4];
    let yy = y + m[5];
    return [
        xx * m[0] + yy * m[2],
        xx * m[1] + yy * m[3]
    ];
}

/* Draw the given game to the given context.
 * Game may be null, in which case the display is cleared.
 */
function draw(ctx, game) {
    let cw = ctx.canvas.width;
    let ch = ctx.canvas.height;
    ctx.fillStyle = color(...COLORS);
    ctx.fillRect(0, 0, cw, ch);
    if (!game)
        return;

    let w = game.width;
    let h = game.height;
    let grid = game.grid;

    let s;
    if (cw / ch < w / h)
        s = cw / w;
    else
        s = ch / h;

    ctx.save();

    let tx = (cw - w  * s) / 2;
    let ty = (ch - h * s) / 2;
    let xf = affine(tx, ty, s, 0);
    game.inv = invert(xf);
    ctx.transform(...xf);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let i = y * w + x;
            let v = grid[i];
            let r = COLORS[v * 3 + 0]
            let g = COLORS[v * 3 + 1]
            let b = COLORS[v * 3 + 2]
            if (game.marked[i]) {
                r = Math.pow(r,0.25);
                g = Math.pow(g,0.25);
                b = Math.pow(b,0.25);
            }
            ctx.fillStyle = color(r, g, b);
            ctx.fillRect(x, y, 1 + 1 / s, 1 + 1 / s);
        }
    }

    ctx.lineWidth = 1 / s;
    ctx.strokeStyle = '#000';
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let c = grid[y * w + x];
            let e = x < w - 1 ? grid[y * w + x + 1] : c;
            let s = y < h - 1 ? grid[(y + 1) * w + x] : c;
            ctx.beginPath();
            if (e !== c) {
                ctx.moveTo(x + 1, y);
                ctx.lineTo(x + 1, y + 1);
            } else {
                ctx.moveTo(x + 1, y + 1);
            }
            if (s !== c) {
                ctx.lineTo(x, y + 1);
            }
            ctx.stroke();
        }
    }

    ctx.restore();
}

/* Bind a menu control to a field on a config object.
 */
function control(id, config, min, max, cb) {
    let buttons = document.querySelectorAll('#' + id + ' button');
    let span = document.querySelector('#' + id + ' span');
    buttons[0].addEventListener('click', function() {
        config[id] = Math.max(min, config[id] - 1);
        span.textContent = config[id];
        if (cb) cb();
    });
    buttons[1].addEventListener('click', function() {
        config[id] = Math.min(max, config[id] + 1);
        span.textContent = config[id];
        if (cb) cb();
    });
    span.textContent = config[id];
}

function toDisplayTime(seconds) {
    let s = Math.round(seconds % 60).toString();
    if (s.length == 1)
        s = '0' + s;
    let m = Math.floor(seconds / 60);
    return m + ':' + s;
}

function computeStats(config) {
    let games = 0;
    let time = 0;
    let average = 0;
    let best = null;
    let completed = 0;
    for (let i = 0; i < config.log.length; i++) {
        let e = config.log[i];
        if (config.width  === e.width &&
            config.height === e.height &&
            config.colors === e.colors) {

            games++;
            if (e.end) {
                completed++;
                time += (e.end - e.start) / 1000;
                average += e.result;
                if (best == null || e.result < best) {
                    best = e.result;
                }
            }
        }
    }
    if (completed > 0) {
        games = completed + ' / ' + games;
        time = toDisplayTime(time / completed);
        average = Math.floor(average * 10 / completed) / 10;
    } else {
        games = '0 / ' + games;
        time = 'N/A';
        average = 'N/A';
        best = 'N/A';
    }
    return {
        games: games,
        time: time,
        average: average,
        best: best
    };
}

document.addEventListener('DOMContentLoaded', function() {
    let ctx = document.getElementsByTagName('canvas')[0].getContext('2d');
    let body = document.getElementsByTagName('body')[0];
    let config = {
        width: WIDTH_DEFAULT,
        height: HEIGHT_DEFAULT,
        colors: COLORS_DEFAULT,
        log: []
    };
    let game = null;
    let logentry = null;

    try {
        let saved = localStorage["tapblock_config"];
        if (saved)
            Object.assign(config, JSON.parse(saved));
    } catch (e) {
        console.log(e);
    }

    function redraw() {
        ctx.canvas.width = window.innerWidth;
        ctx.canvas.height = window.innerHeight;
        draw(ctx, game);
    }
    redraw();

    /* main menu */

    let menu = document.getElementById('menu');
    let gameover = document.getElementById('gameover');
    let score = document.getElementById('score');
    let tapout = document.getElementById('tapout');
    let restart = document.getElementById('restart');
    let statGames = document.getElementById('stat-games');
    let statTime = document.getElementById('stat-time');
    let statAverage = document.getElementById('stat-average');
    let statBest = document.getElementById('stat-best');

    function updateStats() {
        let stats = computeStats(config);
        statGames.textContent = stats.games;
        statTime.textContent = stats.time;
        statAverage.textContent = stats.average;
        statBest.textContent = stats.best;
    }
    updateStats();

    control('width', config, WIDTH_MIN, WIDTH_MAX, updateStats);
    control('height', config, HEIGHT_MIN, HEIGHT_MAX, updateStats);
    control('colors', config, COLORS_MIN, COLORS_MAX, updateStats);
    document.getElementById('start').addEventListener('click', function() {
        game = new tapblock(config.width, config.height, config.colors);
        logentry = {
            start: Date.now(),
            end: null,
            result: null,
            width: config.width,
            height: config.height,
            colors: config.colors
        };
        config.log.push(logentry);
        menu.style.display = 'none';
        redraw();
        try {
            localStorage["tapblock_config"] = JSON.stringify(config);
        } catch (e) {
            console.log(e);
        }
    });
    restart.addEventListener('click', function() {
        gameover.style.display = 'none';
        menu.style.display = 'block';
        updateStats();
    });

    /* game interaction */

    window.addEventListener('resize', function(e) {
        if (game)
            highlight(game, -1, -1);
        redraw();
    });

    ctx.canvas.addEventListener('mousemove', function(e) {
        if (!game) return;
        if (highlight(game, e.clientX, e.clientY))
            ctx.canvas.style.cursor = 'pointer';
        else
            ctx.canvas.style.cursor = 'auto';
        redraw();
    });

    function logGameOver(score) {
        logentry.result = score;
        logentry.end = Date.now();
        try {
            localStorage["tapblock_config"] = JSON.stringify(config);
        } catch (e) {
            console.log(e);
        }
    }

    ctx.canvas.addEventListener('mouseup', function(e) {
        if (!game) return;
        clear(game, e.clientX, e.clientY);
        if (highlight(game, e.clientX, e.clientY))
            ctx.canvas.style.cursor = 'pointer';
        else
            ctx.canvas.style.cursor = 'auto';
        redraw();
        if (game && isdone(game)) {
            let count = blocksleft(game);
            score.textContent = 'Score: ' + count;
            tapout.style.display = count ? 'none' : 'block';
            gameover.style.display = 'block';
            logGameOver(count);
        }
    });

    ctx.canvas.addEventListener('mouseout', function(e) {
        if (!game) return;
        highlight(game, -1, -1);
        ctx.canvas.style.cursor = 'auto';
        redraw();
    });

    let lastTouch = null;

    ctx.canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        if (!game) return;
        lastTouch = e.touches[e.touches.length - 1];
        highlight(game, lastTouch.clientX, lastTouch.clientY);
        redraw();
    });

    ctx.canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();
        if (!game) return;
        lastTouch = e.touches[e.touches.length - 1];
        highlight(game, lastTouch.clientX, lastTouch.clientY);
        redraw();
    });

    ctx.canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        if (!game) return;
        clear(game, lastTouch.clientX, lastTouch.clientY);
        lastTouch = null;
        highlight(game, -1, -1);
        redraw();
        if (game && isdone(game)) {
            let count = blocksleft(game);
            score.textContent = 'Score: ' + count;
            tapout.style.display = count ? 'none' : 'block';
            gameover.style.display = 'block';
            logGameOver(count);
        }
    });
});

const COLORS = new Float32Array([
    0.27, 0.27, 0.27,
    1.00, 0.35, 0.35,
    0.35, 1.00, 0.35,
    0.35, 0.35, 1.00,
    1.00, 1.00, 0.35,
    1.00, 0.35, 1.00,
    0.35, 1.00, 1.00,
]);
const CONNECT = [+1, +0, -1, +0, +0, +1, +0, -1];

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

function inbounds(game, x, y) {
    return x >= 0 && x < game.width && y >= 0 && y < game.height;
}

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

function highlight(game, px, py) {
    let [x, y] = transform(game.inv, px, py);
    x = Math.floor(x);
    y = Math.floor(y);
    mark(game, x, y);
}

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

function isdone(game) {
    for (let y = 0; y < game.height; y++)
        for (let x = 0; x < game.width; x++)
            if (mark(game, x, y))
                return false;
    return true;
}

function score(game) {
    let score = 0;
    for (let y = 0; y < game.height; y++)
        for (let x = 0; x < game.width; x++)
            score += !!game.grid[y * game.width + x];
    return score;
}

function color(r, g, b) {
    return 'rgb(' + Math.round(r * 255) + ', ' +
                    Math.round(g * 255) + ', ' +
                    Math.round(b * 255) + ')';
}

function affine(x, y, scale, rotate){
    return new Float32Array([
        +Math.cos(rotate) * scale,
        +Math.sin(rotate) * scale,
        -Math.sin(rotate) * scale,
        +Math.cos(rotate) * scale,
        x,
        y
    ]);
}

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

function transform(m, x, y){        
    let xx = x + m[4];
    let yy = y + m[5];
    return [
        xx * m[0] + yy * m[2],
        xx * m[1] + yy * m[3]
    ];
}

function draw(ctx, game) {
    let w = game.width;
    let h = game.height;
    let grid = game.grid;

    let cw = ctx.canvas.width;
    let ch = ctx.canvas.height;
    let s;
    if (cw / ch < w / h)
        s = cw / w;
    else
        s = ch / h;

    ctx.fillStyle = color(...COLORS);
    ctx.fillRect(0, 0, cw, ch);
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

    if (isdone(game)) {
        ctx.fillStyle = '#fff';
        ctx.font = '0.8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Game Over', game.width / 2, game.height / 4);
        ctx.font = '0.5px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('Score: ' + score(game), game.width / 2, game.height / 4);
    }

    ctx.restore();
}

document.addEventListener('DOMContentLoaded', function() {
    let ctx = document.getElementsByTagName('canvas')[0].getContext('2d');
    let body = document.getElementsByTagName('body')[0];
    let game = new tapblock(10, 16, 4);

    function redraw() {
        ctx.canvas.width = window.innerWidth;
        ctx.canvas.height = window.innerHeight;
        draw(ctx, game);
    }

    window.addEventListener('resize', redraw);
    redraw();

    function inputmove(e) {
        highlight(game, e.clientX, e.clientY);
        redraw();
    }
    ctx.canvas.addEventListener('mousemove', inputmove);

    function inputup(e) {
        clear(game, e.clientX, e.clientY);
        if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)
            highlight(game, -1, -1);
        else
            highlight(game, e.clientX, e.clientY);
        redraw();
    }
    ctx.canvas.addEventListener('mouseup', inputup);

    function inputend(e) {
        highlight(game, -1, -1);
        redraw();
    }
    ctx.canvas.addEventListener('mouseout', inputup);
});
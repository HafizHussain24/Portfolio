// ─────────────────────────────────────────────────────────────────────────────
//  DataMaze.ts  –  DataMaze (Pacman Clone Logic)
// ─────────────────────────────────────────────────────────────────────────────

export class DataMaze {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private animationId: number = 0;
    private isRunning: boolean = false;
    private lastTime: number = 0;

    private tileSize = 32;
    private map: number[][] = [];
    private score = 0;

    private player = {
        tx: 1, ty: 1, 
        x: 0, y: 0,   
        vx: 0, vy: 0, 
        nextVx: 0, nextVy: 0, 
        speed: 150, 
        isGhost: false
    };

    private ghosts: any[] = [];
    
    // 21 cols x 25 rows = 672 x 800
    private layout = [
        "111111111111111111111",
        "100000000010000000001",
        "101110111010111011101",
        "100000000000000000001",
        "101110101111101011101",
        "100000100010001000001",
        "111110111010111011111",
        "222210100000001012222",
        "111110101121101011111",
        "000000001222100000000",
        "111110101111101011111",
        "222210100000001012222",
        "111110101111101011111",
        "100000000010000000001",
        "101110111010111011101",
        "100010000000000010001",
        "111010101111101010111",
        "100000100010001000001",
        "101111111010111111101",
        "100000000000000000001",
        "101111111010111111101",
        "100000000000000000001",
        "111110101111101011111",
        "100000000010000000001",
        "111111111111111111111"
    ];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d')!;
        this.reset();
    }

    private reset() {
        this.map = this.layout.map(row => row.split('').map(Number));
        this.player.tx = 1; this.player.ty = 1;
        this.player.x = this.player.tx * this.tileSize + this.tileSize / 2;
        this.player.y = this.player.ty * this.tileSize + this.tileSize / 2;
        this.player.vx = 0; this.player.vy = 0;
        this.player.nextVx = 0; this.player.nextVy = 0;
        
        this.ghosts = [
            { tx: 9, ty: 9, x: 9 * this.tileSize + 16, y: 9 * this.tileSize + 16, vx: 1, vy: 0, color: '#ff0055', speed: 120, isGhost: true },
            { tx: 10, ty: 9, x: 10 * this.tileSize + 16, y: 9 * this.tileSize + 16, vx: -1, vy: 0, color: '#ffb8ff', speed: 120, isGhost: true },
            { tx: 11, ty: 9, x: 11 * this.tileSize + 16, y: 9 * this.tileSize + 16, vx: 0, vy: -1, color: '#00e5ff', speed: 120, isGhost: true },
            { tx: 10, ty: 10, x: 10 * this.tileSize + 16, y: 10 * this.tileSize + 16, vx: 0, vy: -1, color: '#ffaa00', speed: 120, isGhost: true }
        ];
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        window.addEventListener('keydown', this.handleInput);
        this.animationId = requestAnimationFrame(this.loop);
    }

    public stop() {
        this.isRunning = false;
        window.removeEventListener('keydown', this.handleInput);
        cancelAnimationFrame(this.animationId);
    }

    private handleInput = (e: KeyboardEvent) => {
        if (!this.isRunning) return;
        switch (e.key) {
            case 'ArrowUp': case 'w': this.player.nextVx = 0; this.player.nextVy = -1; e.preventDefault(); break;
            case 'ArrowDown': case 's': this.player.nextVx = 0; this.player.nextVy = 1; e.preventDefault(); break;
            case 'ArrowLeft': case 'a': this.player.nextVx = -1; this.player.nextVy = 0; e.preventDefault(); break;
            case 'ArrowRight': case 'd': this.player.nextVx = 1; this.player.nextVy = 0; e.preventDefault(); break;
        }
    }

    private isWall(tx: number, ty: number) {
        if (ty < 0 || ty >= this.map.length) return false; 
        const cols = this.map[0].length;
        const wrappedTx = (tx % cols + cols) % cols;
        return this.map[ty][wrappedTx] === 1;
    }

    private moveEntity(ent: any, dt: number) {
        // Instant 180 turn for player
        if (!ent.isGhost) {
            if (ent.nextVx !== 0 || ent.nextVy !== 0) {
                if (ent.nextVx === -ent.vx && ent.nextVy === -ent.vy && (ent.vx !== 0 || ent.vy !== 0)) {
                    ent.vx = ent.nextVx;
                    ent.vy = ent.nextVy;
                }
            }
        }

        let moveAmount = ent.speed * dt;
        while (moveAmount > 0) {
            ent.tx = Math.floor(ent.x / this.tileSize);
            ent.ty = Math.floor(ent.y / this.tileSize);
            
            let cx = ent.tx * this.tileSize + this.tileSize / 2;
            let cy = ent.ty * this.tileSize + this.tileSize / 2;

            if (ent.vx === 0 && ent.vy === 0) {
                // Try to start moving from standstill
                if (ent.nextVx !== 0 || ent.nextVy !== 0) {
                    if (!this.isWall(ent.tx + ent.nextVx, ent.ty + ent.nextVy)) {
                        ent.vx = ent.nextVx;
                        ent.vy = ent.nextVy;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            let distToCenter = 0;
            if (ent.vx > 0) distToCenter = cx - ent.x;
            else if (ent.vx < 0) distToCenter = ent.x - cx;
            else if (ent.vy > 0) distToCenter = cy - ent.y;
            else if (ent.vy < 0) distToCenter = ent.y - cy;

            // Fix floating point epsilon
            if (Math.abs(distToCenter) < 0.001) distToCenter = 0;

            if (distToCenter > 0 && moveAmount >= distToCenter) {
                // We reached/crossed the center of the tile in this step
                ent.x = cx;
                ent.y = cy;
                moveAmount -= distToCenter;

                if (ent.isGhost) {
                    // Ghost intersection logic
                    const dirs = [ {vx: 1, vy: 0}, {vx: -1, vy: 0}, {vx: 0, vy: 1}, {vx: 0, vy: -1} ];
                    const validDirs = dirs.filter(d => 
                        !(d.vx === -ent.vx && d.vy === -ent.vy) && 
                        !this.isWall(ent.tx + d.vx, ent.ty + d.vy)
                    );
                    
                    if (validDirs.length > 0) {
                        const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
                        ent.vx = dir.vx;
                        ent.vy = dir.vy;
                    } else {
                        // Dead end
                        ent.vx = -ent.vx;
                        ent.vy = -ent.vy;
                    }
                } else {
                    // Player intersection logic
                    if (ent.nextVx !== 0 || ent.nextVy !== 0) {
                        if (!this.isWall(ent.tx + ent.nextVx, ent.ty + ent.nextVy)) {
                            ent.vx = ent.nextVx;
                            ent.vy = ent.nextVy;
                        }
                    }
                }

                if (this.isWall(ent.tx + ent.vx, ent.ty + ent.vy)) {
                    ent.vx = 0;
                    ent.vy = 0;
                    break;
                }

            } else {
                ent.x += ent.vx * moveAmount;
                ent.y += ent.vy * moveAmount;
                moveAmount = 0;
            }

            // Wrap around screen
            if (ent.x < 0) ent.x += this.canvas.width;
            if (ent.x >= this.canvas.width) ent.x -= this.canvas.width;
        }
        
        ent.tx = Math.floor(ent.x / this.tileSize);
        ent.ty = Math.floor(ent.y / this.tileSize);
    }

    private update(dt: number) {
        // Move player
        this.moveEntity(this.player, dt);
        
        // Eat dots
        const cols = this.map[0].length;
        const wrappedTx = (this.player.tx % cols + cols) % cols;
        if (this.player.ty >= 0 && this.player.ty < this.map.length) {
            if (this.map[this.player.ty][wrappedTx] === 0) {
                this.map[this.player.ty][wrappedTx] = -1;
                this.score += 10;
            }
        }

        // Move ghosts & check collision
        for (const g of this.ghosts) {
            this.moveEntity(g, dt);
            
            // Collision check (radius based)
            if (Math.hypot(this.player.x - g.x, this.player.y - g.y) < 14) {
                this.reset();
                this.score = 0;
            }
        }
    }

    private draw() {
        this.ctx.fillStyle = '#050510';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Map
        for (let y = 0; y < this.map.length; y++) {
            for (let x = 0; x < this.map[y].length; x++) {
                if (this.map[y][x] === 1) {
                    this.ctx.fillStyle = '#111122';
                    this.ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
                    this.ctx.fillStyle = '#0033aa';
                    this.ctx.fillRect(x * this.tileSize + 2, y * this.tileSize + 2, this.tileSize - 4, this.tileSize - 4);
                } else if (this.map[y][x] === 0) {
                    this.ctx.fillStyle = '#00ff88';
                    this.ctx.shadowBlur = 8;
                    this.ctx.shadowColor = '#00ff88';
                    this.ctx.beginPath();
                    this.ctx.arc(x * this.tileSize + this.tileSize / 2, y * this.tileSize + this.tileSize / 2, 4, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0; // reset
                }
            }
        }

        // Score
        this.ctx.fillStyle = '#00e5ff';
        this.ctx.font = 'bold 24px "Share Tech Mono", monospace';
        this.ctx.textAlign = 'left';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00e5ff';
        this.ctx.fillText(`DATA EXTRACTED: ${this.score} KB`, 16, 26);
        this.ctx.shadowBlur = 0;



        // Draw Player (Pacman)
        this.ctx.save();
        this.ctx.translate(this.player.x, this.player.y);
        
        let angle = 0;
        if (this.player.vx > 0) angle = 0;
        else if (this.player.vx < 0) angle = Math.PI;
        else if (this.player.vy > 0) angle = Math.PI / 2;
        else if (this.player.vy < 0) angle = -Math.PI / 2;
        this.ctx.rotate(angle);

        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#ffff00';
        this.ctx.fillStyle = '#ffff00';

        const time = performance.now();
        const mouthOpen = (Math.sin(time / 100) + 1) / 2; 
        const mouthAngle = 0.2 + mouthOpen * 0.5;

        this.ctx.beginPath();
        this.ctx.arc(0, 0, 12, mouthAngle, Math.PI * 2 - mouthAngle);
        this.ctx.lineTo(0, 0);
        this.ctx.fill();
        this.ctx.restore();

        // Draw Ghosts (Tracker bugs)
        for (const g of this.ghosts) {
            this.ctx.save();
            this.ctx.translate(g.x, g.y);
            
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = g.color;
            this.ctx.fillStyle = g.color;
            
            const time = performance.now();
            const pulse = Math.sin(time / 100 + g.x) * 2;
            
            // Bug square
            this.ctx.beginPath();
            this.ctx.rect(-10 - pulse, -10 - pulse, 20 + pulse * 2, 20 + pulse * 2);
            this.ctx.fill();
            
            // Core
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#fff';
            this.ctx.beginPath();
            this.ctx.rect(-3, -3, 6, 6);
            this.ctx.fill();
            
            this.ctx.restore();
        }
    }

    private loop = (time: number) => {
        if (!this.isRunning) return;
        
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        
        // Prevent huge jumps if tab was unfocused
        if (dt < 0.1) {
            this.update(dt);
        }
        this.draw();
        
        this.animationId = requestAnimationFrame(this.loop);
    }
}

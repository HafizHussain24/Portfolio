import { AudioManager } from '../core/AudioManager';

export class Cutscene {
  private overlay!: HTMLDivElement;
  private terminal!: HTMLDivElement;
  private maskContainer!: HTMLDivElement;
  private isPlaying = false;

  constructor(private audio: AudioManager) {
    this.buildDOM();
  }

  private buildDOM(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'cutscene-overlay';
    
    this.terminal = document.createElement('div');
    this.terminal.id = 'cutscene-terminal';
    
    this.maskContainer = document.createElement('div');
    this.maskContainer.id = 'cutscene-mask';
    this.maskContainer.innerHTML = `
      <img src="/character-face.svg" alt="Vigilante Profile">
      <p>Did you really think it would be that easy, Detective?</p>
    `;
    
    this.overlay.appendChild(this.terminal);
    this.overlay.appendChild(this.maskContainer);
    document.body.appendChild(this.overlay);
  }

  public async playSequence(onComplete: () => void): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    // 1. CRT Glitch & Fade to Black
    this.audio.playClick();
    this.overlay.classList.add('active');
    this.terminal.innerHTML = '';
    this.terminal.classList.remove('terminal-error');
    this.maskContainer.classList.remove('show');
    
    // Slight pause before typing starts
    await this.delay(1000);
    
    // 2. Terminal Typing
    const lines = [
      "> SECURE UPLINK ESTABLISHED...",
      "> DECRYPTING MASTER FILE...",
      "> TARGET IDENTITY ACQUIRED.",
      "> REVEALING PROFILE IN 3...",
      "> 2...",
      "> 1..."
    ];
    
    for (const line of lines) {
      await this.typeLine(line);
      await this.delay(600);
    }
    
    // 3. The Switch / Error
    // We don't have playError, so let's just use BootChime for drama
    this.audio.playBootChime(); 
    this.terminal.classList.add('terminal-error');
    this.terminal.innerHTML += `\n> SYSTEM OVERRIDE.\n> HA HA HA HA...`;
    
    await this.delay(1500);
    
    // 4. Wipe terminal and show Joker
    this.terminal.style.display = 'none';
    this.maskContainer.classList.add('show');
    
    // Play a sinister sound here
    this.audio.playBootChime(); 
    
    // Let it linger for 5 seconds
    await this.delay(5000);
    
    // 5. Fade out and reset
    this.overlay.classList.remove('active');
    
    await this.delay(1000);
    
    this.terminal.style.display = 'block';
    this.isPlaying = false;
    onComplete();
  }

  private async typeLine(text: string): Promise<void> {
    this.terminal.innerHTML += '\n';
    for (let i = 0; i < text.length; i++) {
      this.terminal.innerHTML += text[i];
      if (text[i] !== ' ') {
        this.audio.playHover(); // Use hover sound for tiny clicks
      }
      await this.delay(30);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
  }
}

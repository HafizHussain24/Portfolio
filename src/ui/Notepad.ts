import { QUESTS } from '../content';
import { AudioManager } from '../core/AudioManager';
import { Cutscene } from './Cutscene';

export class Notepad {
  private container!: HTMLElement;
  private panel!: HTMLElement;
  private listEl!: HTMLUListElement;
  
  private isOpen = false;
  private completedQuests = new Set<string>();

  private cutscene!: Cutscene;
  private decryptBtn!: HTMLButtonElement;

  constructor(private audio: AudioManager) {
    this.cutscene = new Cutscene(audio);
    this.buildDOM();
    this.renderTasks();
  }

  private buildDOM(): void {
    // Main container
    this.container = document.createElement('div');
    this.container.id = 'notepad-container';
    
    // Notepad panel (clickable to toggle)
    this.panel = document.createElement('div');
    this.panel.id = 'notepad-panel';
    this.panel.setAttribute('aria-expanded', 'false');
    this.panel.addEventListener('click', () => this.toggle());
    
    // The "tab" sticking out
    const tab = document.createElement('div');
    tab.className = 'notepad-tab';
    tab.innerHTML = '<span class="tab-text">NOTES</span>';
    this.panel.appendChild(tab);
    
    // Header
    const header = document.createElement('h2');
    header.textContent = 'INVESTIGATION NOTES';
    this.panel.appendChild(header);
    
    // Task list
    this.listEl = document.createElement('ul');
    this.listEl.id = 'notepad-list';
    this.panel.appendChild(this.listEl);
    
    this.container.appendChild(this.panel);
    document.body.appendChild(this.container);
  }

  private renderTasks(): void {
    this.listEl.innerHTML = '';
    QUESTS.forEach(quest => {
      const li = document.createElement('li');
      li.id = `quest-${quest.id}`;
      li.className = 'notepad-task';
      
      if (this.completedQuests.has(quest.id)) {
        li.classList.add('completed');
      }
      
      const checkbox = document.createElement('div');
      checkbox.className = 'task-checkbox';
      
      const text = document.createElement('span');
      text.textContent = quest.label;
      text.className = 'task-text';
      
      li.appendChild(checkbox);
      li.appendChild(text);
      this.listEl.appendChild(li);
    });
  }

  public show(): void {
    this.container.style.display = 'flex';
  }

  public toggle(): void {
    this.isOpen = !this.isOpen;
    this.panel.setAttribute('aria-expanded', String(this.isOpen));
    
    if (this.isOpen) {
      this.container.classList.add('open');
      this.audio.playHover(); // A simple sound for opening
    } else {
      this.container.classList.remove('open');
      this.audio.playClick();
    }
  }

  public completeQuest(id: string): void {
    if (this.completedQuests.has(id)) return;
    
    this.completedQuests.add(id);
    this.renderTasks();
    
    // Auto-open notepad to show progress if it's closed
    if (!this.isOpen) {
      this.toggle();
    }
    
    // Play a rewarding sound
    this.audio.playBootChime(); // Can be changed to a custom "scratch" or "ding" sound later
    
    // Check if all are complete
    if (this.completedQuests.size === QUESTS.length) {
      setTimeout(() => this.onAllQuestsComplete(), 1000);
    }
  }

  private onAllQuestsComplete(): void {
    // Change header text
    const header = this.panel.querySelector('h2');
    if (header) {
      header.textContent = 'CASE SOLVED?';
      header.style.color = '#c93b3b';
    }

    // Add decrypt button
    if (!this.decryptBtn) {
      this.decryptBtn = document.createElement('button');
      this.decryptBtn.className = 'notepad-decrypt-btn';
      this.decryptBtn.textContent = '[ DECRYPT TRUE IDENTITY ]';
      this.decryptBtn.addEventListener('click', () => {
        this.cutscene.playSequence(() => {
          // After cutscene completes, add stamp
          const stamp = document.createElement('img');
          stamp.className = 'notepad-trick-stamp';
          stamp.src = '/character-face.svg';
          stamp.alt = 'Vigilante Profile';
          this.panel.appendChild(stamp);
          
          this.decryptBtn.style.display = 'none';
        });
      });
      this.panel.appendChild(this.decryptBtn);
    }
  }
}

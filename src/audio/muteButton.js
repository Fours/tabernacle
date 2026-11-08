/**
 * The speaker button (inside #app, so it rotates with the scene on phones): bottom-right on
 * desktop, beside the menu button on mobile. Hidden on the title screen. `onToggle()` flips
 * the mute; `set(muted)` redraws it; `show(bool)`.
 */
const SPEAKER = '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/>';
const ON = `${SPEAKER}<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`;
const OFF = `${SPEAKER}<path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>`;
const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${body}</svg>`;

export function createMuteButton(app, onToggle, { mobile = false } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `audio-mute hidden${mobile ? ' audio-mute--touch' : ''}`;
  // Keep the press away from the canvas (pointer lock, touch look) and the title screen.
  for (const ev of ['pointerdown', 'mousedown', 'touchstart']) btn.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle();
    btn.blur(); // so Space/Enter while walking don't re-press it
  });
  app.appendChild(btn);
  return {
    el: btn,
    set(muted) {
      btn.innerHTML = svg(muted ? OFF : ON);
      btn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
      btn.setAttribute('aria-pressed', String(muted));
      btn.title = mobile ? '' : muted ? 'Sound off (M)' : 'Sound on (M)';
    },
    show(v) {
      btn.classList.toggle('hidden', !v);
    },
    dispose() {
      btn.remove();
    },
  };
}

/**
 * メニュー画面（起動時と Esc で表示）。設定画面は settings.json の定義から作る（ブラウザ専用）。
 */
import { orderedSettingItems } from './settings.js';

export class Menu {
  /**
   * @param {import('./settings.js').Settings} settings
   * @param {() => void} onResume 「開始」「ゲームに戻る」が押されたときに呼ぶ関数
   */
  constructor(settings, onResume) {
    this.root = document.getElementById('menu');
    this.resumeButton = document.getElementById('menu-resume');
    this.message = document.getElementById('menu-message');
    this.settings = settings;
    this.resumeButton.addEventListener('click', () => {
      this.setMessage('');
      onResume();
    });
    this.buildSettings(document.getElementById('settings-list'));
  }

  /**
   * 設定項目の入力欄を作る。
   * @param {HTMLElement} container
   */
  buildSettings(container) {
    container.replaceChildren();
    for (const [key, item] of orderedSettingItems({ items: this.settings.items })) {
      const label = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = item.label ?? key;
      const output = document.createElement('output');
      const format = (v) => `${v}${item.unit ? ` ${item.unit}` : ''}`;
      let control;
      if (item.type === 'range') {
        control = document.createElement('input');
        control.type = 'range';
        control.min = String(item.min);
        control.max = String(item.max);
        control.step = String(item.step);
        control.value = String(this.settings.get(key));
        control.addEventListener('input', () => {
          output.textContent = format(this.settings.set(key, control.value));
        });
      } else if (item.type === 'select') {
        control = document.createElement('select');
        for (const o of item.options) control.add(new Option(String(o), String(o)));
        control.value = String(this.settings.get(key));
        control.addEventListener('change', () => {
          output.textContent = format(this.settings.set(key, control.value));
        });
      } else {
        control = document.createElement('input');
        control.type = 'checkbox';
        control.checked = this.settings.get(key);
        control.addEventListener('change', () => {
          output.textContent = this.settings.set(key, control.checked) ? 'ON' : 'OFF';
        });
      }
      control.name = key;
      output.textContent = item.type === 'toggle' ? (this.settings.get(key) ? 'ON' : 'OFF') : format(this.settings.get(key));
      label.append(name, control, output);
      container.append(label);
    }
  }

  /**
   * 開始ボタンを押せるようにする。
   * @param {string} text ボタンの文字
   */
  setReady(text) {
    this.resumeButton.disabled = false;
    this.resumeButton.textContent = text;
  }

  /**
   * メッセージを表示する（空文字で消す）。
   * @param {string} text
   */
  setMessage(text) {
    this.message.textContent = text;
  }

  /** メニューを表示する */
  show() {
    this.root.hidden = false;
  }

  /** メニューを隠す */
  hide() {
    this.root.hidden = true;
  }

  /** 表示中か */
  get visible() {
    return !this.root.hidden;
  }
}

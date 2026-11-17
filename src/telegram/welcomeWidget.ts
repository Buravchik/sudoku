const EASY_PREVIEW = '000904600040000831820610000090832107218745000703006000002000400185429060370000020';

export function welcomeWidgetHtml(): string {
  const cells = EASY_PREVIEW.split('').map(digit => `<i>${digit === '0' ? '&nbsp;' : digit}</i>`).join('');
  return `<style>.b{display:grid;grid-template-columns:repeat(9,1fr);gap:1px;background:var(--tg-theme-section-separator-color,#999)}.b i{background:var(--tg-theme-bg-color,#fff);color:var(--tg-theme-text-color,#111);min-height:1.7em;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:13px}</style><div class="b">${cells}</div>`;
}

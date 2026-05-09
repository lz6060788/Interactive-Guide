async function checkStyles(page) {
  const result = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const config = btns.find(b => b.textContent.includes('配置'));
    const gen = btns.find(b => b.textContent.includes('生成'));
    const styles = {};
    if (config) {
      const s = getComputedStyle(config);
      styles.configBtn = { border: s.border, borderColor: s.borderColor, borderWidth: s.borderWidth };
    }
    if (gen) {
      const s = getComputedStyle(gen);
      styles.genBtn = { border: s.border, borderColor: s.borderColor, borderWidth: s.borderWidth };
    }
    // check navbar
    const h2 = document.querySelector('h2');
    if (h2) {
      const nav = h2.closest('div');
      if (nav) {
        const s = getComputedStyle(nav);
        styles.navbar = { borderBottom: s.borderBottom, borderColor: s.borderBottomColor };
      }
    }
    // check sidebar
    const sidebarDivs = document.querySelectorAll('div');
    for (const d of sidebarDivs) {
      const s = getComputedStyle(d);
      if (s.borderRightColor && s.borderRightColor !== 'rgba(0, 0, 0, 0)' && s.borderRightWidth !== '0px') {
        const p = d.querySelector('p');
        if (p && p.textContent.includes('节点')) {
          styles.sidebar = { borderRight: s.borderRight, borderRightColor: s.borderRightColor };
          break;
        }
      }
    }
    return JSON.stringify(styles, null, 2);
  });
  console.log(result);
}

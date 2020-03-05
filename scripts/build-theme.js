const fg = require('fast-glob')
const path = require('path')
const fs = require('fs');

(async () => {
  const files = await fg(path.resolve(__dirname, '../theme/*.json'), { onlyFiles: true })

  const themes = []

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'theme', f), 'utf-8'))
  
    if (Array.isArray(data))
      themes.push(...data)
    else
      themes.push(data)
  }

  const code = 'window.Themes = ' + JSON.stringify(themes)
  fs.writeFileSync(path.resolve(__dirname, '../static/assets/js/theme.js'), code, 'utf-8')
})()
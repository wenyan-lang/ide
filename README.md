# 斋 - Online IDE for wenyan-lang

https://wenyan-ide.netlify.com/

![](https://github.com/wenyan-lang/wenyan/raw/master/screenshots/screenshot02.png)

## Embed IDE

You can embed the Online IDE into your own website by using [iframe](https://www.w3schools.com/tags/tag_iframe.asp).

```html
<iframe src="https://wenyan-ide.netlify.com/embed" height="300" width="500"></iframe>
```

The basic URL is https://wenyan-ide.netlify.com/embed

You can config the IDE by using query strings.

### Query Options

| Field | Description | Default | 
| --- | --- | --- |
| `title` | The title of the file | `""` |
| `code` | The wenyan script in the editor | `""` |
| `autorun` | Execute the script on loaded | `false` |
| `show-compile` | Show the `Compiled` panel | `false` |
| `show-configs` | Show the configs buttons | `false` |
| `show-bars` | Show action bars in editor | `false` |
| `hide-output` | Hide output panel | `false` |
| `readonly` | Make file readonly **WIP** | `false` |
| `dark` | Use dark theme | `false` |
| `output-hanzi` | Output numbers as hanzi | `false` |

Here are some example usages:

- [/embed?autorun&title=問天地好在&code=吾有一言。曰「「問天地好在。」」。書之。](https://wenyan-ide.netlify.com/embed?autorun&title=%E5%95%8F%E5%A4%A9%E5%9C%B0%E5%A5%BD%E5%9C%A8&code=%E5%90%BE%E6%9C%89%E4%B8%80%E8%A8%80%E3%80%82%E6%9B%B0%E3%80%8C%E3%80%8C%E5%95%8F%E5%A4%A9%E5%9C%B0%E5%A5%BD%E5%9C%A8%E3%80%82%E3%80%8D%E3%80%8D%E3%80%82%E6%9B%B8%E4%B9%8B%E3%80%82)
- [/embed?dark&show-compile&autorun&title=問天地好在&code=吾有一數。曰三。名之曰「甲」。%0A為是「甲」遍。%0A%09吾有一言。曰「「問天地好在。」」。書之。%0A云云。](https://wenyan-ide.netlify.com/embed?dark&show-compile&autorun&title=%E5%95%8F%E5%A4%A9%E5%9C%B0%E5%A5%BD%E5%9C%A8&code=%E5%90%BE%E6%9C%89%E4%B8%80%E6%95%B8%E3%80%82%E6%9B%B0%E4%B8%89%E3%80%82%E5%90%8D%E4%B9%8B%E6%9B%B0%E3%80%8C%E7%94%B2%E3%80%8D%E3%80%82%0A%E7%82%BA%E6%98%AF%E3%80%8C%E7%94%B2%E3%80%8D%E9%81%8D%E3%80%82%0A%09%E5%90%BE%E6%9C%89%E4%B8%80%E8%A8%80%E3%80%82%E6%9B%B0%E3%80%8C%E3%80%8C%E5%95%8F%E5%A4%A9%E5%9C%B0%E5%A5%BD%E5%9C%A8%E3%80%82%E3%80%8D%E3%80%8D%E3%80%82%E6%9B%B8%E4%B9%8B%E3%80%82%0A%E4%BA%91%E4%BA%91%E3%80%82)

### iFrame Communication

You can get more controls over iframe by

```html
<iframe src="https://wenyan-ide.netlify.com/embed" id="editor"></iframe>
```

#### Sending

```js
const editor = document.getElementById('editor')

// Change title
editor.contentWindow.postMessage({ action: 'title', value: 'New Title' }, '*')

// Update code
editor.contentWindow.postMessage({ action: 'code', value: '吾有一言。曰「「問天地好在。」」。書之。' }, '*')

// change to dark mode, (by specify `field` option, you can change other options as well)
editor.contentWindow.postMessage({ action: 'config', field: 'dark', value: true }, '*')

// re-run code
editor.contentWindow.postMessage({ action: 'run' }, '*')

// clear output
editor.contentWindow.postMessage({ action: 'clear' }, '*')
```

#### Receiving

```js
window.addEventListener('message', (e) => {
  // filtering, message from the ide always contains `source` filed.
  if (e.data.source === 'wenyan-ide') {
    if (e.data.action === 'change') {
      console.log('Code changed to ' + e.data.value)
    }
  }
})
```
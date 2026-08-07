const marked = require('marked');
const katex = { renderToString: (t) => '<math>'+t+'</math>' };
const markdown = '### Problem Description\nGiven an integer $a$, output the value of $a + 1$.\n\n### Input Format\nA single integer $a$.\n\n### Output Format\nA single integer representing $a + 1$.\n\n### Constraints\n- The problem does not specify constraints, but standard integer types should be assumed.';

const store = [];
let md = markdown.replace(/\$\$([\s\S]+?)\$\$/g, function (_, tex) {
  const i = store.length;
  try { store.push(katex.renderToString(tex.trim(), { displayMode: true,  throwOnError: false })); }
  catch (e) { store.push('<span>' + tex + '</span>'); }
  return 'KMATH' + i + 'ENDKM';
});

md = md.replace(/\$([^\$]+?)\$/g, function (_, tex) {
  const i = store.length;
  try { store.push(katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false })); }
  catch (e) { store.push('<span>' + tex + '</span>'); }
  return 'KMATH' + i + 'ENDKM';
});

let html = marked.parse(md);

html = html.replace(/KMATH(\d+)ENDKM/g, function (_, i) {
  return store[parseInt(i, 10)] || '';
});
console.log(html);

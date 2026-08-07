const text = 'Given an integer $a$, output the value of $a + \n 1$.';
const store = [];
let md = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => { store.push(tex); return 'KMATH' + (store.length-1) + 'ENDKM'; });
md = md.replace(/\$([^\$]+?)\$/g, (_, tex) => { store.push(tex); return 'KMATH' + (store.length-1) + 'ENDKM'; });
console.log('Processed:', md);
console.log('Store:', store);

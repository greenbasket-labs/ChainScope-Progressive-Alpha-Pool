import assert from 'node:assert/strict';
const growth=(c,b)=>c===null||b===null||b===0?null:(c-b)/b*100;const pull=(c,p)=>c===null||p===null||p===0?null:(c-p)/p*100;
assert.equal(growth(150,100),50);assert.equal(pull(75,100),-25);assert.equal(growth(150,null),null);
const rules=[{enabled:true,metric:'a',operator:'>=',value:10},{enabled:true,metric:'b',operator:'<=',value:5},{enabled:true,metric:'c',operator:'>=',value:20}];const o={a:12,b:5,c:1};const score=rules.filter(r=>(r.operator==='>='?o[r.metric]>=r.value:o[r.metric]<=r.value)).length;assert.equal(score,2);assert.equal(score>=2,true);console.log('engine tests passed');

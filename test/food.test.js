// 守門測試：餐廳清單鎖定為使用者修正後的版本（35 間：後門 21、宵夜街 14）。
// 新增、刪除或改名都會讓此測試失敗，需有人明確更新快照。已刪除的店家不得被恢復。
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOOD } from '../src/data/food.js';
import { PLACES } from '../src/data/places.js';

const BACK = ["竹香自助餐","惟克美而美","哈堡堡","萊姆斯","達啵廚房","福泉豆花麵食店","飽咖咖","新福牛肉麵","街角216","迷路義麵屋","白鬍子平價牛排","馬爾波咖啡","歐姆萊斯","Daddy's Hamburg","Sidewalk人行道蔬食","Backdoor Café 胡思胡作","No.17 White House","麥克小姐早午餐","八方雲集","路易莎咖啡","108果汁"];
const NIGHT = ["無敵蛋餅","來客餐坊","霸王香雞排","中央餐車雞排","小籠包","一億園","麥味登","粥王","川一品鍋","香煎小舖","早安美芝城","夠義式義大利麵","幸福廚房","傻師傅湯包"];
const names = (a) => FOOD.filter((f) => f.area === a).map((f) => f.name);

test('餐廳清單與使用者修正版一致', () => {
  assert.equal(FOOD.length, 35);
  assert.deepEqual(names('後門'), BACK);
  assert.deepEqual(names('宵夜街'), NIGHT);
  assert.ok(names('後門').includes('108果汁'), '108 果汁屬於後門');
});
test('暫停營業的松苑、第九餐廳不在清單與地點庫', () => {
  const all = JSON.stringify(FOOD) + JSON.stringify(PLACES);
  assert.ok(!/松苑|第九/.test(all));
});
test('每間店都有分類，且不含價格、營業時間或評價欄位', () => {
  for (const f of FOOD) { assert.ok(f.category); assert.deepEqual(Object.keys(f).sort(), ['area', 'category', 'name', 'type']); }
});

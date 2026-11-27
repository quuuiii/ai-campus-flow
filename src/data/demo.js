// Demo 情境（中央大學學生日常）
export const DEMO_TEXT = '我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。';
export const COURSE_COLORS = ['#2f6fed', '#12a88b', '#e08a1e', '#a855c7', '#e5546b', '#2d9cc4'];
export const demoCourses = () => {
  const rows = [];
  let id = 1;
  for (const day of ['1', '2', '3', '4', '5']) {
    rows.push(
      { id: 'demo' + id++, day, start: '09:00', end: '11:50', name: '系統分析與設計', building: 'mgmt2', color: 0, demo: true },
      { id: 'demo' + id++, day, start: '13:00', end: '14:50', name: '企業資料通訊', building: 'eng5', color: 1, demo: true },
    );
  }
  return rows;
};

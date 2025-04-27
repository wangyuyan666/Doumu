var rawJSON = JSON.parse($response.body);

rawJSON.datas = {
   ...rawJSON.datas,
   "newType": 1,
   "type": 1,
   "autoChange": 1,
   "notice": 1,
   "dailyChange": 1,
   "change": 1,
   "weeklyChange": 1,
   "status": 1,
   "vipTime" : 4102415999000,
   "subscribe" : 1
}

$done({body : JSON.stringify(rawJSON)});
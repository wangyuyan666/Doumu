var rawJSON = JSON.parse($response.body);

rawJSON.data = {
   ...rawJSON.data,
   "expireAt" : 4070912400000,
   "createdAt" : 1735693200000,
   "premium" : true,
   "subscription" : 1
}

$done({body : JSON.stringify(rawJSON)});
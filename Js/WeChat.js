/*
微信 去除公众号文章底部广告

ORIGINAL: https://raw.githubusercontent.com/NobyDa/Script/master/QuantumultX/File/Wechat.js

***************************
QuantumultX:

[rewrite_local]
^https?:\/\/mp\.weixin\.qq\.com\/mp\/getappmsgad url script-response-body https://raw.githubusercontent.com/wangyuyan666/Doumu/main/Js/Noad/Wechat.js

[mitm]
hostname = mp.weixin.qq.com

***************************/

var obj = JSON.parse($response.body);
obj.advertisement_num = 0;
obj.advertisement_info = [];
delete obj.appid;
$done({body: JSON.stringify(obj)}); 

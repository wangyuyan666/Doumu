/**
 * 山丘阅读 VIP
 * http://i.815616.xyz/api/v2/myinfo/8?token=dd6a733b1726108390491hbi5&device=0.4,5.32,iPhone%2014%20Pro,17.6.1,zh-Hans&uid=a5d5068d8&v=566
 **/
var body = $response.body;
var obj = JSON.parse(body);

obj = {
  "status": "1",
  "data": [{
    "token": "a6597a05",
    "appleid": null,
    "email": null,
    "wxopenid": null,
    "wxunionid": null,
    "headimgurl": null,
    "nickname": null,
    "uuid": "a5d5068d8",
    "device": null,
    "banned": "0",
    "vipto": "2099-12-31 23:59:59",
    "type": "1",
    "cid": "20e3fe61"
  }],
  "seconds": 0.001
}


body = JSON.stringify(obj);
$done({body});

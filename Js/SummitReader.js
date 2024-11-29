/**
 * 山丘阅读 VIP
 * http://i.815616.xyz/api/v2/myinfo/8?token=dd6a733b1726108390491hbi5&device=0.4,5.32,iPhone%2014%20Pro,17.6.1,zh-Hans&uid=a5d5068d8&v=566
 **/
var target = JSON.parse($response.body);

target.data[0].type = "9";
target.data[0].vipto = "2099-12-31 23:59:59";

$done({body : JSON.stringify(target)});
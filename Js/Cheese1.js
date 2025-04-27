var body = $response.body;
var obj = JSON.parse(body);

obj = {
	"code": "000",
	"message": "成功",
	"timestamp": null,
	"datas": {
		"vipTime": 4102415999000,
		"vipType": 1,
		"userType": 1
	}
}


body = JSON.stringify(obj);
$done({body});


body = $response.body.replace('\"gu_type":0', '\"gu_type":1').replace('\"gu_money":0', '\"gu_money":99999999')

$done({body});
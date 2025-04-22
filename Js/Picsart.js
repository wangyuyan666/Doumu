var body = $response.body;
var obj = JSON.parse(body);

obj = {
  "status": "success",
  "response": [
    {
      "status": "SUBSCRIPTION_PURCHASED",
      "order_id": "490001314520000",
      "original_order_id": "490001314520000",
      "is_trial": true,
      "plan_meta": {
        "storage_limit_in_mb": 20480,
        "frequency": "yearly",
        "scope_id": "full",
        "id": "com.picsart.editor.subscription_yearly",
        "product_id": "subscription_yearly",
        "level": 2000,
        "description": "china",
        "type": "renewable",
        "auto_renew_product_id": "com.picsart.editor.subscription_yearly",
        "tier_id": "gold_old",
        "permissions": [
          "premium_tools_standard",
          "premium_tools_ai"
        ]
      },
      "limitation": {
        "max_count": 5,
        "limits_exceeded": false
      },
      "reason": "ok",
      "subscription_id": "com.picsart.editor.subscription_yearly",
      "is_eligible_for_introductory": false,
      "purchase_date": 1687020148000,
      "expire_date": 4092599349000
    }
  ]
}


body = JSON.stringify(obj);
$done({body});

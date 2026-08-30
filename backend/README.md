# ShieldAhead Backend — Wi-Fi API

Flask API providing nearby free wifi/connectivity locations for Epic 2 (US 2.1).
提供 Epic 2（US 2.1）所需的附近免费 wifi 数据的 Flask 后端 API。

---

## Requirements 环境要求

- Python 3.10+ recommended / 建议使用 Python 3.10 及以上版本
- **Internet connection required for uncached requests** — the API uses Nominatim, VicFreeWiFi and Vicmap. Cached data can avoid repeat source calls for a short period, but the backend is not an offline data store.
  **未缓存的请求需要联网** — API 使用 Nominatim、VicFreeWiFi 和 Vicmap。短时间内可使用缓存避免重复访问数据源，但后端并不是离线数据库。

## Setup 环境搭建

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run 启动服务

```bash
python3 app.py
```

Server starts at `http://127.0.0.1:5001`.
服务启动后监听 `http://127.0.0.1:5001`。

---

## Endpoint 接口

```
GET /api/wifi?postcode=3453
```

`postcode` is required and must be a valid Victorian postcode (3000-3999).
`postcode` 参数必填，必须是有效的维州邮编（3000-3999）。

### Example response 示例返回

```json
{
  "records": [
    {
      "id": "vicfreewifi-BD-01-ArtGallery",
      "name": "ArtGallery",
      "address": "BD-01-ArtGallery",
      "suburb": "Bendigo",
      "postcode": "3550",
      "latitude": -36.757711,
      "longitude": 144.276886,
      "distanceKm": 0.4,
      "openingHours": null,
      "accessConditions": [],
      "verificationStatus": "confirmed",
      "dataUpdatedAt": "2019-04-25T12:52:19.803232"
    }
  ],
  "metadata": {
    "version": "1.1",
    "generatedAt": "2026-08-29T13:55:43.566025+00:00",
    "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
    "coverageAreas": ["Central Melbourne", "Central Bendigo", "Central Ballarat", "Regional Victoria (libraries and community centres)"],
    "limitations": [],
    "removedRecordIds": []
  }
}
```

### Error responses 错误码

| Status 状态码 | Meaning 含义 |
|---|---|
| 400 | Missing, invalid, or unlocatable postcode / 邮编缺失、格式无效或无法定位 |
| 429 | More than 30 requests/minute from the same IP / 同一 IP 每分钟超过 30 次请求 |
| 500 | Unexpected server error / 服务器未预料到的错误 |
| 503 | Both data sources (VicFreeWiFi and Vicmap) are unavailable / 两个数据源同时不可用 |

---

## Data sources 数据源

- **VicFreeWiFi Access Point Locations** - confirmed wifi hotspots (Melbourne, Bendigo, Ballarat pilot areas)
  确认的 wifi 热点（Melbourne、Bendigo、Ballarat 试点区域）
- **Vicmap Features of Interest** - libraries and community centres statewide, wifi likely but not confirmed
  全维州的图书馆和社区中心，推测有 wifi 但未确认

Results are combined, deduplicated, filtered to a 30km radius of the given postcode, and sorted nearest-first. If nothing is found within 30km, the nearest 10 results statewide are returned instead, with a note in `metadata.limitations`.

两个数据源的结果会合并、去重、按给定邮编 30km 范围过滤，并按距离从近到远排序。如果 30km 内没有任何结果，会退而返回全维州最近的 10 条记录，并在 `metadata.limitations` 里注明。

---

## Caching 缓存机制

- Wifi/library data is cached in memory for 5 minutes to avoid re-fetching both external sources on every request.
  wifi/图书馆数据在内存中缓存 5 分钟，避免每次请求都重新拉取两个外部数据源。
- Postcode-to-coordinates lookups (via Nominatim) are cached for the lifetime of the backend process. Restarting the server clears this in-memory cache.
  邮编转坐标（通过 Nominatim）会在当前后端进程运行期间保留；重启服务器会清空这份内存缓存。

---

## Tests 测试

```bash
# Tests that don't need network access (fast, always safe to run)
# 不需要网络的测试（速度快，随时可以运行）
python3 -m pytest test_app.py -v -m "not real_network"

# Tests that call the real external APIs (Nominatim/VicFreeWiFi/Vicmap)
# 调用真实外部 API 的测试（Nominatim/VicFreeWiFi/Vicmap）
python3 -m pytest test_app.py -v -m real_network
```

---

## Known limitations 已知限制

- No production CORS restriction (currently allows all origins - fine for local dev/demo).
  未做生产环境 CORS 限制（目前允许所有来源访问——开发/演示阶段没有问题）。
- No automated retry/backoff if Nominatim itself rate-limits this server.
  如果 Nominatim 本身对本服务器限流，目前没有自动重试/退避机制。

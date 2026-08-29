# ShieldAhead 前端数据交接说明

> 状态：前端数据需求提案 v0.1
> 阅读对象：前端、后端和数据团队
> 范围：Iteration 1 — Epic 2 和 Epic 3（US 3.1–3.3）
> 最后更新：2026-08-28

## 1. 文档目的

目前，附近 Wi-Fi 地点和 Support Service 的前端 Mock 功能已经完成。本文档用于说明现有 UI 希望接收什么数据，以便后端和数据团队按照同一套约定完成后续开发。

这不是数据库 Schema，也不要求数据库使用完全相同的字段名。后端可以读取、清洗和转换名称不同的原始字段，但最终提供给前端的数据，应当符合本文档中的 Contract，或者提供双方确认过的 Adapter 映射。

在团队检查真实数据集的代表性记录之前，这份 Contract 保持为 `v0.1`，不能视为已经冻结的最终 API Contract。

## 2. 职责边界

### 前端人员

- 根据页面和 User Story 定义需要显示的信息。
- 维护面向前端的 TypeScript Contract 和 Mock fixtures。
- 处理已约定的可选字段以及各种页面状态。
- 后端 API 可用后，将 Mock Repository 替换为 API Repository。
- 验证真实数据能否在现有页面中正确显示。

### 数据人员

- 提供数据来源、Schema、字段说明和代表性记录。
- 说明覆盖范围、缺失字段、更新频率和数据质量。
- 确认数据许可、Attribution 和业务筛选规则。
- 指出哪些字段无法提供，或者需要从其他数据源获取。

### 后端人员

- 读取、清洗和标准化原始数据。
- 将数据库或原始数据字段映射为前端约定的 Contract。
- 提供稳定 ID、Metadata、错误处理规则和环境地址。
- 实现团队确认的距离计算和数据新鲜度判断。
- 修改字段类型、Enum 或响应结构前，先通知并与前端确认。

## 3. 当前代码参考

- 前端数据类型：`frontend/src/data/contracts.ts`
- Repository 接口：`frontend/src/data/repositories.ts`
- 正常及异常 Mock fixtures：`frontend/src/data/mock/mockRepositories.ts`
- Epic 2 测试：`frontend/src/features/wifi/pages/WifiEpic2.test.tsx`
- Epic 3 测试：`frontend/src/features/support-services/pages/SupportEpic3.test.tsx`

当前页面依赖 Repository 接口，不直接依赖数据库字段名，也没有在页面组件中写死 API URL。

## 4. 建议的 API

Iteration 1 最小可用 API 可以是：

```http
GET /api/v1/wifi-locations?postcode=3453
GET /api/v1/support-services?postcode=3453
```

当前前端可以通过稳定的 `id`，从列表数据中找到详情记录。Iteration 1 暂时不一定需要单独的详情接口。

如果后续数据量或访问规则要求单独详情接口，可以增加：

```http
GET /api/v1/wifi-locations/{id}
GET /api/v1/support-services/{id}
```

以上 Endpoint 名称只是前端提案，需要与后端负责人确认。

## 5. 统一响应结构

Wi-Fi 和 Support Service 建议使用相同的外层响应结构：

```ts
interface DatasetResult<T> {
  records: T[];
  metadata: DatasetMetadata;
}

interface DatasetMetadata {
  version: string;
  generatedAt: string;
  sourceName: string;
  coverageAreas: string[];
  limitations: string[];
  freshnessStatus?: "current" | "stale";
  removedRecordIds?: string[];
}
```

示例：

```json
{
  "records": [],
  "metadata": {
    "version": "support-2026-08-28-v1",
    "generatedAt": "2026-08-28T08:30:00.000Z",
    "sourceName": "Approved support-service dataset",
    "coverageAreas": ["Harcourt 3453", "Castlemaine 3450"],
    "limitations": [],
    "freshnessStatus": "current",
    "removedRecordIds": []
  }
}
```

如果查询成功但没有记录，通常应返回 HTTP `200` 和 `records: []`，而不是 HTTP `404`。

## 6. Wi-Fi 地点 Contract

```ts
interface WifiLocation {
  id: string;
  name: string;
  address?: string;
  suburb: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  openingHours?: string;
  accessConditions?: string[];
  dataUpdatedAt: string;
}
```

返回记录示例：

```json
{
  "id": "wifi-harcourt-library",
  "name": "Harcourt Community Wi-Fi",
  "address": "12 Example Street",
  "suburb": "Harcourt",
  "postcode": "3453",
  "latitude": -36.999,
  "longitude": 144.263,
  "distanceKm": 0.8,
  "openingHours": "Monday–Friday, 9:00 am–5:00 pm",
  "accessConditions": [
    "Available during opening hours",
    "Ask staff before connecting"
  ],
  "dataUpdatedAt": "2026-08-28T08:30:00.000Z"
}
```

### Wi-Fi 特殊要求

- `id` 在多次数据更新之间必须保持稳定。
- 如果某条记录被数据更新删除，应通过 `metadata.removedRecordIds` 返回其旧 ID，前端会据此清除用户保存的 usual spot。
- 前端已经能够处理缺少地址、距离、开放时间和 access conditions 的记录。
- 团队需要确认由谁计算 `distanceKm`，以及使用哪一种位置或 postcode 计算方法。

## 7. Support Service Contract

```ts
type AvailabilityStatus =
  | "not-confirmed"
  | "normal"
  | "low"
  | "closed";

interface SupportService {
  id: string;
  name: string;
  serviceTypes: string[];
  address?: string;
  suburb: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  phone?: string;
  website?: string;
  eligibility?: string;
  partnerStatus?: "partner" | "open-referral" | "unknown";
  availabilityStatus: AvailabilityStatus;
  availabilityUpdatedAt?: string;
  availabilityFreshness?: "current" | "stale";
  dataUpdatedAt: string;
}
```

返回记录示例：

```json
{
  "id": "support-food-relief-001",
  "name": "Example Food Relief Service",
  "serviceTypes": ["Food parcels", "Financial counselling"],
  "address": "123 Example Street",
  "suburb": "Harcourt",
  "postcode": "3453",
  "latitude": -36.999,
  "longitude": 144.263,
  "distanceKm": 1.2,
  "phone": "03 5000 0000",
  "website": "https://example.org",
  "eligibility": "Referral not required. Assistance is available once every four weeks.",
  "partnerStatus": "partner",
  "availabilityStatus": "normal",
  "availabilityUpdatedAt": "2026-08-28T08:15:00.000Z",
  "availabilityFreshness": "current",
  "dataUpdatedAt": "2026-08-28T08:30:00.000Z"
}
```

### Support Service 特殊要求

- `partnerStatus` 表示机构与项目的合作关系；`availabilityStatus` 表示服务当前的可用性。两个字段不能互换。
- 如果没有经过验证的 Availability 数据源，应返回 `availabilityStatus: "not-confirmed"`。
- 不能根据无关字段猜测 `normal`、`low` 或 `closed`。
- 返回经过验证的 `normal`、`low` 或 `closed` 时，应同时返回 `availabilityUpdatedAt`。
- 数据或后端团队需要定义 stale 判断时限，并说明 Partner availability 的来源。
- 前端已经能够处理缺少地址、距离、电话、网站和 eligibility 的记录。

## 8. 字段和值的规则

- 必填字段必须存在，并且类型必须符合 Contract。
- v1 中没有数据的可选字段，建议直接省略，不要返回 `null`。
- 空数组使用 `[]`，不要使用 `null`。
- 日期统一使用 ISO 8601 UTC，例如 `2026-08-28T08:30:00.000Z`。
- Enum 必须使用约定的精确拼写。
- 未经过 Contract Review，不能自行增加新的 Enum 值。
- Stable ID 不能取决于列表顺序，也不能在每次刷新时改变。
- 数据集发布内容发生变化时，应修改 `version`。
- `generatedAt` 表示本次数据集是什么时候生成的。
- `dataUpdatedAt` 表示单条记录是什么时候更新的。

如果后端必须返回 `null`，团队应当记录这一决定，并在集成时增加统一的 Normalising Adapter。

## 9. 隐私边界

查询 Wi-Fi 和 Support Service 时，后端通常只需要用户的 postcode。除非未来需求和 Consent 明确允许，否则以下本地资料不应发送到后端：

- 姓名；
- 年龄；
- 家庭成员信息；
- 健康需求；
- Accessibility needs；
- Consent 选择。

默认情况下，个人资料和健康信息不能放入 URL、服务器日志或 Analytics。

## 10. 初始字段映射表

前端填写前两列，数据人员确认原始字段，后端填写转换方式和责任人。

| 前端字段 | 页面用途 | 原始数据字段 | 是否存在 | 转换方式/负责人 | 缺失时如何处理 |
|---|---|---|---|---|---|
| `id` | 详情查找、保存记录 | 待确认 | 待确认 | 数据/后端 | 必填且必须稳定 |
| `name` | 记录标题 | 待确认 | 待确认 | 后端映射 | 必填 |
| `address` | 地点详情 | 待确认 | 待确认 | 后端清洗 | 显示“未确认” |
| `serviceTypes` | 服务分类和筛选 | 待确认 | 待确认 | 数据人员分类 | 没有时使用 `[]` |
| `phone` | Published contact | 待确认 | 待确认 | 后端清洗 | 显示“未发布” |
| `eligibility` | 条件、Referral、访问限制 | 待确认 | 待确认 | 数据/后端 | 显示通用 fallback |
| `latitude/longitude` | 距离和未来地图 | 待确认 | 待确认 | 数据验证 | 未来使用 Map fallback |
| `distanceKm` | 按距离排序 | 计算字段 | 待确认 | 团队决定 | 未知距离放在最后 |
| `availabilityStatus` | Know-before-you-go 状态 | 待确认/Partner 来源 | 待确认 | 后端/Partner | 使用 `not-confirmed` |
| `dataUpdatedAt` | Saved copy 日期 | 待确认 | 待确认 | 后端 | 必填 |

## 11. 需要数据人员提供的信息

- 数据集来源 URL 或文件位置。
- Schema 或 Data Dictionary。
- 每个数据集 10–20 条有代表性的记录。
- 覆盖地区和已知缺口。
- 缺失值和重复 ID 情况。
- 更新计划和维护负责人。
- 是否有 Stable ID、地址和经纬度。
- 是否有电话、网站、Eligibility 和详细 Service Type。
- 是否有权威的 Partner availability 数据。
- 数据许可和 Attribution 要求。

## 12. 需要后端人员提供的信息

- 建议的 Endpoint 和 API base URL。
- Development/Test 环境 URL。
- OpenAPI/Swagger 文档或同等的响应示例。
- Stable ID 方案。
- 距离计算由谁负责以及计算方法。
- 缺失字段使用省略还是 `null`。
- 日期、时区和 Freshness 规则。
- HTTP `400`、`404`、`429` 和 `500` 错误格式。
- Timeout 和 Retry 规则。
- 本地开发地址与部署地址的 CORS 配置。
- 数据版本和已删除记录机制。

## 13. 集成验收清单

- [ ] 前端、后端和数据人员已经共同检查真实数据样本。
- [ ] 字段映射表中不存在未解决的必填字段。
- [ ] Contract v1 已经得到确认并保存版本。
- [ ] 正常 Wi-Fi 响应符合 Contract。
- [ ] 正常 Support Service 响应符合 Contract。
- [ ] 空结果使用 HTTP `200` 和 `records: []`。
- [ ] 缺少可选字段不会导致前端崩溃。
- [ ] 日期和 Enum 能通过 Runtime validation。
- [ ] 数据刷新后 Stable ID 保持不变。
- [ ] 被删除的 usual spot ID 能被正确处理。
- [ ] 未经验证的 Availability 使用 `not-confirmed`。
- [ ] Stale metadata 能触发 Saved copy 警告。
- [ ] CORS 在本地和 Preview 前端中正常工作。
- [ ] Production 不会意外使用 Mock records。
- [ ] 前端针对 Test API 的 Integration tests 通过。

## 14. 可以直接发给团队的交接消息

> 大家好，目前 Epic 2 和 Epic 3 的前端 Mock 功能已经完成并合并到 `main`。现有 TypeScript Contract 和 Mock fixtures 定义了 UI 希望接收的数据结构，也包含正常、空数据、缺失字段和 stale 等状态。
>
> 这份文档目前是前端数据需求提案 v0.1，不是最终数据库或 API Schema。数据库可以使用不同的字段名，后端负责将原始数据转换为团队最终确认的前端响应结构。
>
> 请数据人员提供数据来源、Schema、许可信息，以及每个数据集 10–20 条代表性记录。请后端人员检查建议的 API 结构，并确认 Stable ID、距离计算、缺失字段、日期、CORS 和 Test 环境方案。
>
> 三方完成字段映射表后，我们再冻结 Contract v1。后端 API 准备好以后，前端会将 Mock Repository 替换为 API Repository，并进行 Integration testing。

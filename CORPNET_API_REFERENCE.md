# CorpNet Business Formation API — Integration Reference

## Authentication
- **API Key** (HTTP Header): `token: 7E90-738C-175F-41BD-886C`
- **Bearer Token (Staging)**: `0D3DB6A514DAED0CEF4F97D71DC9292BA84C895FE25A4EB34D09CDF4F2242F95DB554C9C88D3044F5A05F67457B4F82C44F6`

## Environments
| Environment | Base URL | Token |
|---|---|---|
| Staging | https://api.staging24.corpnet.com | 0D3DB6A514DAED0CEF4F97D71DC9292BA84C895FE25A4EB34D09CDF4F2242F95DB554C9C88D3044F5A05F67457B4F82C44F6 |
| Production | https://api.corpnet.com | TBD after onboarding |

## Headers
```json
{
  "Authorization": "Bearer 0D3DB6A514DAED0CEF4F97D71DC9292BA84C895FE25A4EB34D09CDF4F2242F95DB554C9C88D3044F5A05F67457B4F82C44F6",
  "token": "7E90-738C-175F-41BD-886C",
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

## Core Endpoints

### 1. Get Formation Packages
`GET /api/business-formation-v2/package?entityType={type}&state={state}`

**Query Params:**
- `entityType` (required): LLC, C-Corp, S-Corp, Non-Profit Corporation, Professional Corporation
- `state` (required): e.g., CA, NY, TX, WY, DE, FL

**Response:**
```json
{
  "statusCode": "200",
  "message": "success",
  "value": {
    "packageCollection": [{
      "state": "California",
      "serviceCategory": "Business Formation",
      "entityType": "Limited Liability Company",
      "name": "Business Formation - LLC - California - Complete",
      "productPackages": [{
        "name": "Business Formation - LLC - California - Complete",
        "price": 269,
        "productFamily": "Package",
        "productOptions": [
          {"productName": "Name Availability Check", "packageDisplaySelection": "Bundled"},
          {"productName": "California Official Filed Articles of Organization", "packageDisplaySelection": "Bundled"},
          {"productName": "LLC Operating Agreement Template", "packageDisplaySelection": "Optional", "price": 99}
        ],
        "productConstraints": [{"name": "Select Speed?", "minOptions": 1, "maxOptions": 1}]
      }]
    }]
  }
}
```

### 2. Create Business Formation Order
`POST /api/business-formation-v2/create-order`

**Body:**
```json
{
  "partnerOrder": {
    "pcid": "unique-partner-client-id",
    "businessStructureType": "Limited Liability Company (LLC)",
    "businessStateInitial": "CA",
    "contact": {
      "contactEmail": "user@email.com",
      "contactFirstName": "John",
      "contactLastName": "Doe",
      "contactPhone": "5551234567",
      "contactEveningPhone": ""
    },
    "companyInfo": {
      "companyDesiredName": "My Company LLC",
      "companyAlternativeName": "",
      "companyBusinessCategory": "technology",
      "companyBusinessDescription": "AI software development"
    },
    "businessAddress": {
      "businessAddressCountry": "US",
      "businessAddressAddress1": "123 Main St",
      "businessAddressAddress2": "Suite 100",
      "businessAddressCity": "Los Angeles",
      "businessAddressState": "CA",
      "businessAddressZip": "90001"
    },
    "registerAgent": {
      "registeredAgentIsCorpnetAgent": true,
      "registeredAgentFirstName": "",
      "registeredAgentLastName": "",
      "registeredAgentAddress1": "",
      "registeredAgentAddress2": "",
      "registeredAgentCity": "",
      "registeredAgentState": "",
      "registeredAgentZip": "",
      "registeredAgentCountry": ""
    },
    "packageId": "package-id-from-step-1",
    "products": [
      {"productId": "product-id", "quantity": "1"}
    ]
  }
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "success",
  "data": {
    "partnerOrder": {
      "orderGuid": "801VB00000g0JaVYAU",
      "orderPhase": "Order Received",
      "orderStatus": "Third Party Received",
      "apiUserPid": "14684",
      ...
    }
  }
}
```

### 3. Get Order Summary
`GET /api/business-formation-v2/order-summary/{orderId}`

### 4. Upload Documents
`POST /api/business-formation-v2/documents/upload`

### 5. Get Documents
`GET /api/business-formation-v2/documents/{orderGuid}`

## Order Lifecycle
1. **Order Received** → "Third Party Received"
2. **Reviewing Information** → "Ready for Editing" / "Returned to Editing"
3. **Processing** → "Ready for Processing" / "Signature Needed RFI" / "Filing Rejected"
4. **Submitted to Agency** → "State - Awaiting Approval"
5. **Filing Approved** → "Awaiting Docs" / "Prepare for Completion"
6. **Complete** → "Complete Info Received" / "Missing Information"
7. **On Hold** → "Data Needed RFI" / "Requested by Client"
8. **Cancelled** → "Requested by API Partner" / "Client Unresponsive"

## Entity Types
- LLC
- C-Corp
- S-Corp
- Non-Profit Corporation
- Professional Corporation

## Services Available
- Business Name Checks
- Articles of Organization
- Registered Agent Services
- Federal EIN Acquisition
- Custom Agreements & Minutes
- Corporate Kits & Seals
- IRS S-Corp Election (Form 2553)
- Annual Reports
- FinCEN BOI Reporting

## Processing Speeds
- Standard
- Express
- 24-Hour Rush (varies by state)

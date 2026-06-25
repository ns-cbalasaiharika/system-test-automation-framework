# Provisioner Service Operations

Tenant provisioning and client configuration services.

## What to Add Here

1. **`core-operations.ts`** - Core provisioner operations
2. **`branding-operations.ts`** - Branding service operations
3. **`client-services-operations.ts`** - Client services operations
4. **`client-status-operations.ts`** - Client status operations
5. **`index.ts`** - Export all operations

## Required Operations

Based on `config/cluster-load/cluster-services.yaml`:

### Core Service (port 8889)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getTenant` | GET | `/api/v1/tenants/{tenantId}` | Get tenant info |
| `getClientConfig` | GET | `/api/v1/tenants/{tenantId}/config` | Get tenant config |
| `updateTenantConfig` | PUT | `/api/v1/tenants/{tenantId}/config` | Update tenant config |

### Branding Service (port 6000)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getBrandingByUPN` | GET | `/branding/upn` | Get branding by UPN |
| `getBrandingByEmail` | GET | `/branding/email` | Get branding by email |

### Client Services (port 6001)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getClientConfig` | GET | `/client/config` | Get client config |
| `pushClientConfig` | POST | `/client/config` | Push client config |

### Client Status (port 6003)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `updateStatus` | POST | `/client/status` | Update client status |

## Reference

- See `operations/client-oppy/` for a complete working example
- See `operations/templates/service-template.ts` for a starter template

# Node Balance Enforcement Service

## Overview

This standalone service balances pods across multiple preferred nodes that share the same labels. It prevents situations where all apps end up scheduled on a single preferred node after node rotation or cluster changes.

## Use Case

Consider this scenario:
1. Two nodes exist with label `nodetype=small`: `node-small-1` and `node-small-2`
2. `node-small-1` goes down, all pods move to `node-small-2`
3. A new `node-small-1` joins the cluster
4. The affinity enforcement service moves pods from non-preferred nodes, but all pods that were already on `node-small-2` stay there
5. **This service detects the imbalance and redistributes pods across both `nodetype=small` nodes**

## How It Works

### Scheduling
- Runs every **5 minutes**, offset by 2 minutes from the affinity enforcement service (cron: `2-59/5 * * * *`)
- Automatically starts when QuickStack initializes

### Logic Flow

1. **Find Apps**: Queries database for all apps with `nodeAffinityType = 'PREFERRED'` that have label selectors configured

2. **Group Apps**: Groups apps by their normalized label selectors (so apps preferring the same node type are balanced together)

3. **Get Cluster State**: Retrieves current node list with labels from Kubernetes

4. **For Each Group**:
   - Finds all nodes matching the group's preferred labels
   - If fewer than 2 preferred nodes exist, skips (nothing to balance)
   - Counts pods per preferred node (pods on non-preferred nodes are ignored)
   - If `maxPods - minPods > 1` (skew exceeds 1): restarts excess pods from the overloaded node

5. **Pod Restart**: Deletes excess pods from overloaded nodes. Kubernetes reschedules them, and due to lower resource utilization on underloaded nodes, they typically land on the less-loaded preferred node.

### Balance Algorithm

Given N pods across M preferred nodes:
- **Ideal max** per node: `ceil(N / M)`
- **Excess** on a node: `node_count - ideal_max`
- Only nodes with positive excess have pods restarted
- A skew of 1 is considered acceptable (e.g., 3 pods across 2 nodes → 2 and 1 is fine)

**Example**: 6 pods, 3 nodes → ideal max = 2. If distribution is [6, 0, 0], restarts 4 pods from the overloaded node.

### Grouping Logic

Apps are grouped by their normalized label selectors. Labels are sorted alphabetically to ensure consistent grouping regardless of declaration order:

```json
// These are treated as the same group:
[{"key": "nodetype", "value": "small"}, {"key": "region", "value": "us-east"}]
[{"key": "region", "value": "us-east"}, {"key": "nodetype", "value": "small"}]
```

## Relationship with Affinity Enforcement Service

These two services are complementary:

| Service | Purpose | Runs At |
|---------|---------|---------|
| **Affinity Enforcement** | Moves pods FROM non-preferred TO preferred nodes | `*/5 * * * *` (0, 5, 10...) |
| **Balance Enforcement** | Distributes pods evenly ACROSS preferred nodes | `2-59/5 * * * *` (2, 7, 12...) |

The balance service runs 2 minutes after affinity enforcement, so pods are first moved to preferred nodes, then balanced across them.

## Safety Features

- **Only affects PREFERRED affinity**: Apps with `REQUIRED` affinity or no affinity are not touched
- **Skew tolerance of 1**: A difference of 1 pod between nodes is considered acceptable
- **Only rebalances preferred nodes**: Pods on non-preferred nodes are ignored (handled by affinity enforcement)
- **Graceful degradation**: Single preferred node = no action
- **Error isolation**: Failures processing one group don't affect others
- **Logging**: All actions are logged for monitoring and debugging

## Configuration

### Changing Schedule

Edit the cron expression in the service file:

```typescript
scheduleService.scheduleJob(JOB_NAME, '2-59/5 * * * *', async () => {
    // Change cron expression as needed
    // '2-59/10 * * * *' = every 10 minutes (offset by 2)
    // '0 * * * *' = every hour at :00
});
```

### Disabling the Service

Comment out the service initialization in `server.ts`:

```typescript
// const nodeBalanceEnforcementService = (await import('./server/services/standalone-services/node-balance-enforcement.service')).default;
// nodeBalanceEnforcementService.configureCronJobs();
```

## Monitoring

Check the application logs for service activity:

```bash
# Normal operation:
[NodeBalanceEnforcementService] Starting node balance enforcement check...
[NodeBalanceEnforcementService] Found N app(s) with preferred node affinity.
[NodeBalanceEnforcementService] All pods are balanced across preferred nodes.

# When rebalancing:
[NodeBalanceEnforcementService] Imbalance detected: distribution is [node-small-1=5, node-small-2=1]
[NodeBalanceEnforcementService] Restarting pod <podName> from overloaded node node-small-1 for balance.
[NodeBalanceEnforcementService] Restarted N pod(s) for better node balance.
```

## Testing

Run the test suite:

```bash
npm test -- node-balance-enforcement.service.test.ts
```

The tests cover:
- No-op when no apps have preferred affinity
- No-op when only one preferred node exists
- Restarting pods when imbalanced across preferred nodes
- Not restarting when already balanced
- Tolerating a skew of 1
- Only counting pods on preferred nodes
- Independent handling of different label selector groups
- Severe imbalance across three nodes
- Correct grouping of multi-label selectors regardless of order

## Implementation Details

### Files
- Service: `src/server/services/standalone-services/node-balance-enforcement.service.ts`
- Tests: `src/__tests__/server/node-balance-enforcement.service.test.ts`
- Documentation: `src/server/services/standalone-services/NODE_BALANCE_ENFORCEMENT.md`
- Initialization: `src/server.ts`

### Dependencies
- `schedule.service.ts` - Cron job scheduling
- `node.service.ts` - Node information with labels
- `standalone-pod.service.ts` - Pod queries
- `kubernetes-api.adapter.ts` - Kubernetes API operations
- `db.client.ts` - Database queries

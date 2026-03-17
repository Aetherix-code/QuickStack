# Node Affinity Enforcement Service

## Overview

This standalone service ensures that applications with **preferred node affinity** configurations are running on their preferred nodes when those nodes are available in the cluster.

## Use Case

Consider this scenario:
1. An app has preferred node affinity: `nodetype=small`
2. A `nodetype=small` node goes down
3. Kubernetes reschedules the app on a `nodetype=big` node (the only available option)
4. Later, a new `nodetype=small` node joins the cluster
5. **This service detects this situation and moves the app back to the preferred node**

## How It Works

### Scheduling
- Runs every **5 minutes** (configurable via cron expression `*/5 * * * *`)
- Automatically starts when QuickStack initializes

### Logic Flow

1. **Find Apps**: Queries database for all apps with `nodeAffinityType = 'PREFERRED'` that have label selectors configured

2. **Get Cluster State**: Retrieves current node list with labels from Kubernetes

3. **Check Each App**:
   - Gets all running pods for the app
   - For each pod:
     - Checks which node it's currently running on
     - Determines if nodes matching all preferred labels exist
     - If pod is on non-preferred node AND preferred nodes are available: **restarts the pod**

4. **Pod Restart**: Deletes the pod, allowing Kubernetes to reschedule it on a preferred node based on the affinity configuration

### Label Matching Logic

**Preferred node affinity uses AND logic** - a node must match ALL label selectors:

Example: If an app has:
```json
[
  { "key": "nodetype", "value": "small", "weight": 100 },
  { "key": "region", "value": "us-east", "weight": 50 }
]
```

Only nodes with BOTH `nodetype=small` AND `region=us-east` are considered preferred.

## Safety Features

- **Only affects PREFERRED affinity**: Apps with `REQUIRED` affinity or no affinity are not touched
- **Graceful degradation**: If no preferred nodes exist, apps stay where they are
- **Error handling**: Failures processing one app don't affect others
- **Logging**: All actions are logged for monitoring and debugging

## Configuration

### Changing Schedule

Edit the cron expression in [node-affinity-enforcement.service.ts](../node-affinity-enforcement.service.ts):

```typescript
scheduleService.scheduleJob(JOB_NAME, '*/5 * * * *', async () => {
    // Change '*/5 * * * *' to your desired schedule
    // Examples:
    // '*/10 * * * *' = every 10 minutes
    // '0 * * * *' = every hour at :00
    // '0 0 * * *' = once per day at midnight
});
```

### Disabling the Service

Comment out or remove the service initialization in [server.ts](../../server.ts):

```typescript
// const nodeAffinityEnforcementService = (await import('./server/services/standalone-services/node-affinity-enforcement.service')).default;
// nodeAffinityEnforcementService.configureCronJobs();
```

## Monitoring

Check the application logs for service activity:

```bash
# Look for log entries like:
[NodeAffinityEnforcementService] Starting node affinity enforcement check...
[NodeAffinityEnforcementService] Found N app(s) with preferred node affinity.
[NodeAffinityEnforcementService] App <appId> pod <podName> is on node <nodeName>, which doesn't match preferred labels. Restarting...
[NodeAffinityEnforcementService] Restarted N pod(s) to move to preferred nodes.
```

## Testing

Run the test suite:

```bash
npm test -- node-affinity-enforcement.service.test.ts
```

The tests cover:
- No-op when no apps have preferred affinity
- Restarting pods on non-preferred nodes
- Not restarting pods already on preferred nodes
- Not restarting when no preferred nodes are available
- Handling multiple label selectors with AND logic

## Implementation Details

### Files
- Service: `src/server/services/standalone-services/node-affinity-enforcement.service.ts`
- Tests: `src/__tests__/server/node-affinity-enforcement.service.test.ts`
- Initialization: `src/server.ts`

### Dependencies
- `schedule.service.ts` - Cron job scheduling
- `node.service.ts` - Node information with labels
- `standalone-pod.service.ts` - Pod queries
- `kubernetes-api.adapter.ts` - Kubernetes API operations
- `db.client.ts` - Database queries

## Performance Considerations

- **Lightweight**: Only queries apps with preferred affinity
- **Efficient**: Skips apps without running pods
- **Batched**: Processes all apps in a single cron run
- **Non-blocking**: Runs asynchronously, doesn't affect API requests

## Future Enhancements

Possible improvements:
- Configurable cooldown period to avoid pod thrashing
- Metrics/statistics on pod moves
- Webhook notifications when pods are moved
- Support for more complex affinity rules

import type { TriggerDefinition, TriggerDeliveryTarget } from "@carvis/core";

export function resolveTriggerDeliveryTarget(definition: Pick<TriggerDefinition, "deliveryTarget">) {
  if (definition.deliveryTarget.kind === "none") {
    return null;
  }

  return definition.deliveryTarget satisfies TriggerDeliveryTarget;
}

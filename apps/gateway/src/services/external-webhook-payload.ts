type ValidateExternalWebhookPayloadInput = {
  payload: Record<string, unknown>;
  requiredFields: string[];
  optionalFields: string[];
};

type ValidateExternalWebhookPayloadResult =
  | {
      ok: true;
      variables: Record<string, string>;
    }
  | {
      ok: false;
      reason: string;
    };

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function validateExternalWebhookPayload(
  input: ValidateExternalWebhookPayloadInput,
): ValidateExternalWebhookPayloadResult {
  const variables: Record<string, string> = {};

  for (const field of input.requiredFields) {
    const value = input.payload[field];
    if (!(field in input.payload) || value == null || value === "") {
      return {
        ok: false,
        reason: `missing_required_field:${field}`,
      };
    }
    if (!isTemplateScalar(value)) {
      return {
        ok: false,
        reason: `invalid_field_type:${field}`,
      };
    }
    variables[field] = coerceTemplateVariable(value);
  }

  for (const field of input.optionalFields) {
    const value = input.payload[field];
    if (value == null || value === "") {
      continue;
    }
    if (!isTemplateScalar(value)) {
      return {
        ok: false,
        reason: `invalid_field_type:${field}`,
      };
    }
    variables[field] = coerceTemplateVariable(value);
  }

  return {
    ok: true,
    variables,
  };
}

export function renderExternalWebhookPrompt(input: {
  promptTemplate: string;
  variables: Record<string, string>;
}) {
  return input.promptTemplate.replaceAll(TEMPLATE_VARIABLE_PATTERN, (_match, variableName: string) => {
    return input.variables[variableName] ?? "";
  });
}

function coerceTemplateVariable(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function isTemplateScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

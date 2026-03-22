const AUTOMATION_PLAN_V1_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: [
        'version',
        'platform',
        'intent',
        'risk',
        'requires_confirmation',
        'summary',
        'context_refs',
        'steps',
        'script',
        'post_context'
    ],
    properties: {
        version: { type: 'string', enum: ['1.0'] },
        platform: { type: 'string', enum: ['darwin', 'win32', 'linux'] },
        intent: { type: 'string', minLength: 2, maxLength: 80 },
        risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        requires_confirmation: { type: 'boolean' },
        summary: { type: 'string', minLength: 1, maxLength: 260 },
        context_refs: {
            type: 'object',
            additionalProperties: false,
            required: ['app', 'target', 'recipient'],
            properties: {
                app: { type: 'string', maxLength: 120 },
                target: { type: 'string', maxLength: 240 },
                recipient: { type: 'string', maxLength: 120 }
            }
        },
        steps: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['action', 'target', 'value', 'risk'],
                properties: {
                    action: { type: 'string', minLength: 2, maxLength: 80 },
                    target: { type: 'string', maxLength: 240 },
                    value: { type: 'string', maxLength: 1000 },
                    risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
                }
            }
        },
        script: {
            type: 'object',
            additionalProperties: false,
            required: ['language', 'content'],
            properties: {
                language: { type: 'string', enum: ['applescript', 'powershell', 'bash'] },
                content: { type: 'string', minLength: 1, maxLength: 12000 }
            }
        },
        post_context: {
            type: 'object',
            additionalProperties: false,
            required: ['app', 'target', 'recipient'],
            properties: {
                app: { type: 'string', maxLength: 120 },
                target: { type: 'string', maxLength: 240 },
                recipient: { type: 'string', maxLength: 120 }
            }
        }
    }
};

function normalizeText(value, max = 240) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function normalizeAutomationPlan(plan) {
    if (!plan || typeof plan !== 'object') return null;

    const normalized = {
        version: plan.version === '1.0' ? '1.0' : '1.0',
        platform: String(plan.platform || '').trim(),
        intent: normalizeText(plan.intent, 80),
        risk: String(plan.risk || 'medium').trim().toLowerCase(),
        requires_confirmation: Boolean(plan.requires_confirmation),
        summary: normalizeText(plan.summary, 260),
        context_refs: {
            app: normalizeText(plan.context_refs?.app, 120),
            target: normalizeText(plan.context_refs?.target, 240),
            recipient: normalizeText(plan.context_refs?.recipient, 120)
        },
        steps: Array.isArray(plan.steps)
            ? plan.steps.slice(0, 10).map((step) => ({
                action: normalizeText(step?.action, 80),
                target: normalizeText(step?.target, 240),
                value: normalizeText(step?.value, 1000),
                risk: String(step?.risk || '').trim().toLowerCase()
            }))
            : [],
        script: {
            language: String(plan.script?.language || '').trim().toLowerCase(),
            content: String(plan.script?.content || '').trim().slice(0, 12000)
        },
        post_context: {
            app: normalizeText(plan.post_context?.app, 120),
            target: normalizeText(plan.post_context?.target, 240),
            recipient: normalizeText(plan.post_context?.recipient, 120)
        }
    };

    if (!['low', 'medium', 'high', 'critical'].includes(normalized.risk)) {
        normalized.risk = 'medium';
    }
    normalized.steps = normalized.steps.filter((step) => step.action);
    normalized.steps.forEach((step) => {
        if (!['low', 'medium', 'high', 'critical'].includes(step.risk)) {
            step.risk = 'medium';
        }
    });
    return normalized;
}

function validateAutomationPlanV1(plan, options = {}) {
    if (!plan || typeof plan !== 'object') return { valid: false, error: 'Plan must be an object' };
    if (plan.version !== '1.0') return { valid: false, error: 'Unsupported version' };
    if (!['darwin', 'win32', 'linux'].includes(plan.platform)) return { valid: false, error: 'Invalid platform' };
    if (!plan.intent) return { valid: false, error: 'Missing intent' };
    if (!['low', 'medium', 'high', 'critical'].includes(plan.risk)) return { valid: false, error: 'Invalid risk' };
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) return { valid: false, error: 'Missing steps' };
    for (const step of plan.steps) {
        if (!step || typeof step !== 'object') return { valid: false, error: 'Invalid step entry' };
        if (!step.action) return { valid: false, error: 'Step missing action' };
        if (!['low', 'medium', 'high', 'critical'].includes(step.risk)) {
            return { valid: false, error: 'Step risk must be low|medium|high|critical' };
        }
    }
    if (!plan.script || typeof plan.script !== 'object') return { valid: false, error: 'Missing script payload' };
    if (!plan.script.content) return { valid: false, error: 'Missing script content' };
    if (!['applescript', 'powershell', 'bash'].includes(plan.script.language)) {
        return { valid: false, error: 'Invalid script language' };
    }

    const expectedLanguage = options.expectedLanguage;
    if (expectedLanguage && plan.script.language !== expectedLanguage) {
        return { valid: false, error: `Script language mismatch (${plan.script.language} != ${expectedLanguage})` };
    }
    return { valid: true };
}

module.exports = {
    AUTOMATION_PLAN_V1_SCHEMA,
    normalizeAutomationPlan,
    validateAutomationPlanV1
};

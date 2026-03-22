#!/usr/bin/env node

/**
 * Strict verification for critical YAMNet alert rules.
 * - Ensures critical rule IDs/labels are present
 * - Ensures per-category confidence floors exist
 * - Ensures YAMNet runtime is primary over AST fallback
 */

const {
    YAMNET_ALERT_RULES,
    CATEGORY_MIN_CONFIDENCE,
    YAMNET_RUNTIME_CONFIG,
    AST_MODEL_CONFIGS
} = require('../electron/sound-classifier');

function fail(message) {
    throw new Error(message);
}

function run() {
    const requiredRuleIds = [
        'smoke_alarm',
        'fire_alarm',
        'siren',
        'doorbell',
        'knock',
        'baby_cry',
        'alarm_generic'
    ];

    const ruleIds = YAMNET_ALERT_RULES.map((rule) => rule.id);
    const missingIds = requiredRuleIds.filter((id) => !ruleIds.includes(id));
    if (missingIds.length > 0) {
        fail(`Missing critical alert rules: ${missingIds.join(', ')}`);
    }

    const requiredLabels = [
        'smoke detector, smoke alarm',
        'fire alarm',
        'doorbell',
        'ding-dong',
        'knock',
        'baby cry, infant cry'
    ];
    const allRuleLabels = YAMNET_ALERT_RULES.flatMap((rule) => rule.labels || []).map((item) => String(item).toLowerCase());
    const missingLabels = requiredLabels.filter((label) => !allRuleLabels.includes(label));
    if (missingLabels.length > 0) {
        fail(`Missing required critical labels in alert rules: ${missingLabels.join(', ')}`);
    }

    const requiredCategories = ['emergency', 'attention', 'communication', 'appliance', 'environmental', 'media'];
    const missingCategoryThresholds = requiredCategories.filter((category) => !Number.isFinite(CATEGORY_MIN_CONFIDENCE[category]));
    if (missingCategoryThresholds.length > 0) {
        fail(`Missing category confidence floors: ${missingCategoryThresholds.join(', ')}`);
    }

    if (!YAMNET_RUNTIME_CONFIG || typeof YAMNET_RUNTIME_CONFIG !== 'object') {
        fail('Missing YAMNET_RUNTIME_CONFIG export');
    }

    const yamnetModelUrl = String(YAMNET_RUNTIME_CONFIG.modelUrl || '');
    if (!yamnetModelUrl.includes('storage.googleapis.com/mediapipe-models/audio_classifier/yamnet')) {
        fail(`YAMNet model URL must target official MediaPipe source (got ${yamnetModelUrl || 'empty'})`);
    }

    const yamnetWeight = Number(YAMNET_RUNTIME_CONFIG.weight);
    const astPrimary = Array.isArray(AST_MODEL_CONFIGS) ? AST_MODEL_CONFIGS[0] : null;
    const astWeight = Number(astPrimary?.weight);
    if (!Number.isFinite(yamnetWeight) || !Number.isFinite(astWeight)) {
        fail('Unable to resolve runtime model weights from exported configs');
    }
    if (!(yamnetWeight > astWeight)) {
        fail(`YAMNet must be weighted higher than AST (got yamnet=${yamnetWeight}, ast=${astWeight})`);
    }

    console.log('Verified sound alert rules: critical classes, thresholds, MediaPipe YAMNet source, and YAMNet-first weighting.');
}

try {
    run();
} catch (error) {
    console.error(`[verify-sound-alert-rules] ${error.message}`);
    process.exit(1);
}

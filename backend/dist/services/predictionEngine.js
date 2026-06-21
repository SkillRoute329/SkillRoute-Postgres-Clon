"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionEngine = void 0;
/**
 * predictionEngine.ts — Motor de Predicción ML (Sprints 5-6).
 *
 * Implementa un regresor de Árbol de Decisión (Decision Tree Regressor)
 * en TypeScript puro para estimar el tiempo de viaje al próximo stop.
 * Cero dependencias binarias externas (ej. python/xgboost).
 *
 * FASE 3 Bloque 4.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../config/logger"));
class PredictionEngine {
    constructor() {
        this.root = null;
        this.metrics = null;
        this.isTrained = false;
        this.modelPath = path_1.default.join(__dirname, '../../data/trained_model.json');
        this.csvPath = path_1.default.join(__dirname, '../../data/training_data.csv');
        this.loadOrInitialize();
    }
    static getInstance() {
        if (!PredictionEngine.instance) {
            PredictionEngine.instance = new PredictionEngine();
        }
        return PredictionEngine.instance;
    }
    /**
     * Carga un modelo entrenado desde el archivo JSON si existe.
     * Si no, inicializa un modelo físico por defecto.
     */
    loadOrInitialize() {
        try {
            if (fs_1.default.existsSync(this.modelPath)) {
                const raw = fs_1.default.readFileSync(this.modelPath, 'utf8');
                const parsed = JSON.parse(raw);
                this.root = parsed.tree;
                this.metrics = parsed.metrics;
                this.isTrained = true;
                logger_1.default.info('[ML Engine] Modelo cargado exitosamente desde JSON.', { mae: this.metrics?.mae });
                return;
            }
        }
        catch (e) {
            logger_1.default.error('[ML Engine] Error cargando modelo JSON:', e);
        }
        // Fallback: Modelo físico heurístico inicial
        this.isTrained = false;
        logger_1.default.info('[ML Engine] Sin modelo entrenado. Utilizando regresor heurístico por defecto.');
    }
    /**
     * Predice el tiempo de viaje en segundos basándose en las features dadas.
     */
    predict(features) {
        if (this.isTrained && this.root) {
            return this.predictNode(this.root, features);
        }
        // Heurística de fallback: física básica de velocidad y distancia
        // Velocidad en metros por segundo
        const speedMs = Math.max(1.0, (features.speed_kmh * 1000) / 3600);
        const baseSeconds = features.distance_meters / speedMs;
        // Ajustar por hora pico
        let rushHourFactor = 1.0;
        if ((features.time_of_day_min >= 480 && features.time_of_day_min <= 570) || // 8am-9:30am
            (features.time_of_day_min >= 1020 && features.time_of_day_min <= 1140)) { // 5pm-7pm
            rushHourFactor = 1.3;
        }
        // Ajustar por desvío (si está atrasado, usualmente va más lento/congestionado)
        const deviationPenalty = features.scheduled_deviation_min > 3 ? features.scheduled_deviation_min * 12 : 0;
        return Math.round((baseSeconds + deviationPenalty) * rushHourFactor);
    }
    predictNode(node, features) {
        if (node.value !== undefined) {
            return node.value;
        }
        const val = features[node.feature];
        if (val <= node.threshold) {
            return this.predictNode(node.left, features);
        }
        else {
            return this.predictNode(node.right, features);
        }
    }
    /**
     * Entrena el árbol de decisión leyendo el CSV de datos.
     */
    async trainModel() {
        logger_1.default.info('[ML Engine] Iniciando entrenamiento del árbol de regresión...');
        if (!fs_1.default.existsSync(this.csvPath)) {
            throw new Error(`Dataset de entrenamiento no encontrado en: ${this.csvPath}. Por favor ejecute el pipeline primero.`);
        }
        const csvContent = fs_1.default.readFileSync(this.csvPath, 'utf8');
        const lines = csvContent.split('\n').filter(Boolean);
        const headers = lines[0].split(',');
        const records = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length < headers.length)
                continue;
            records.push({
                speed_kmh: parseFloat(parts[4]),
                distance_meters: parseInt(parts[5], 10),
                day_of_week: parseInt(parts[6], 10),
                time_of_day_min: parseInt(parts[7], 10),
                scheduled_deviation_min: parseFloat(parts[8]),
                target: parseInt(parts[9], 10)
            });
        }
        if (records.length < 50) {
            throw new Error('Muestras insuficientes para entrenar el modelo (mínimo 50 registros).');
        }
        // Dividir en train/test (80% train / 20% test)
        const shuffled = [...records].sort(() => Math.random() - 0.5);
        const trainCount = Math.floor(shuffled.length * 0.8);
        const trainData = shuffled.slice(0, trainCount);
        const testData = shuffled.slice(trainCount);
        // Entrenar árbol recursivamente
        const maxDepth = 6;
        const minSamplesSplit = 10;
        this.root = this.buildTree(trainData, 0, maxDepth, minSamplesSplit);
        this.isTrained = true;
        // Evaluar modelo en test set
        let absoluteErrorSum = 0;
        let squaredErrorSum = 0;
        // Para cálculo de R2
        let targetSum = 0;
        testData.forEach(d => targetSum += d.target);
        const meanTarget = targetSum / testData.length;
        let ssTotal = 0;
        let ssResidual = 0;
        testData.forEach(d => {
            const pred = this.predict(d);
            absoluteErrorSum += Math.abs(pred - d.target);
            squaredErrorSum += Math.pow(pred - d.target, 2);
            ssTotal += Math.pow(d.target - meanTarget, 2);
            ssResidual += Math.pow(d.target - pred, 2);
        });
        const mae = absoluteErrorSum / testData.length;
        const rmse = Math.sqrt(squaredErrorSum / testData.length);
        const r2 = 1 - (ssResidual / (ssTotal || 1));
        this.metrics = {
            mae: parseFloat(mae.toFixed(2)),
            rmse: parseFloat(rmse.toFixed(2)),
            r2: parseFloat(Math.max(-1.0, Math.min(1.0, r2)).toFixed(3)),
            datasetSize: records.length,
            trainedAt: new Date().toISOString()
        };
        this.isTrained = true;
        // Guardar a JSON
        const modelPayload = {
            tree: this.root,
            metrics: this.metrics
        };
        // Asegurar directorio
        const dir = path_1.default.dirname(this.modelPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(this.modelPath, JSON.stringify(modelPayload, null, 2), 'utf8');
        logger_1.default.info('[ML Engine] Entrenamiento completado con éxito y guardado en JSON.', this.metrics);
        return this.metrics;
    }
    getModelMetrics() {
        return this.metrics;
    }
    /**
     * Construye recursivamente los nodos del árbol de decisión buscando la división óptima (MSE mínimo).
     */
    buildTree(data, depth, maxDepth, minSamplesSplit) {
        const defaultVal = data.reduce((acc, curr) => acc + curr.target, 0) / data.length;
        // Caso base
        if (depth >= maxDepth || data.length < minSamplesSplit) {
            return { value: Math.round(defaultVal) };
        }
        let bestFeature = null;
        let bestThreshold = 0;
        let bestMseReduction = -1;
        let bestLeft = [];
        let bestRight = [];
        const features = ['speed_kmh', 'distance_meters', 'day_of_week', 'time_of_day_min', 'scheduled_deviation_min'];
        const currentMse = this.calculateMse(data);
        for (const f of features) {
            // Tomamos umbrales representativos
            const values = data.map(d => d[f]);
            const thresholds = this.getQuantiles(values, 10); // 10 divisiones candidatas
            for (const t of thresholds) {
                const left = data.filter(d => d[f] <= t);
                const right = data.filter(d => d[f] > t);
                if (left.length === 0 || right.length === 0)
                    continue;
                const mseLeft = this.calculateMse(left);
                const mseRight = this.calculateMse(right);
                // Reducción ponderada del MSE
                const varianceBefore = currentMse * data.length;
                const varianceAfter = (mseLeft * left.length) + (mseRight * right.length);
                const reduction = varianceBefore - varianceAfter;
                if (reduction > bestMseReduction) {
                    bestMseReduction = reduction;
                    bestFeature = f;
                    bestThreshold = t;
                    bestLeft = left;
                    bestRight = right;
                }
            }
        }
        // Si no logramos una división relevante, devolvemos hoja
        if (!bestFeature || bestMseReduction <= 0) {
            return { value: Math.round(defaultVal) };
        }
        return {
            feature: bestFeature,
            threshold: bestThreshold,
            left: this.buildTree(bestLeft, depth + 1, maxDepth, minSamplesSplit),
            right: this.buildTree(bestRight, depth + 1, maxDepth, minSamplesSplit)
        };
    }
    calculateMse(data) {
        if (data.length === 0)
            return 0;
        const mean = data.reduce((acc, curr) => acc + curr.target, 0) / data.length;
        const sumSq = data.reduce((acc, curr) => acc + Math.pow(curr.target - mean, 2), 0);
        return sumSq / data.length;
    }
    getQuantiles(values, n) {
        const sorted = [...values].sort((a, b) => a - b);
        const result = [];
        for (let i = 1; i < n; i++) {
            const idx = Math.floor(sorted.length * (i / n));
            if (idx < sorted.length && !result.includes(sorted[idx])) {
                result.push(sorted[idx]);
            }
        }
        return result;
    }
}
exports.PredictionEngine = PredictionEngine;

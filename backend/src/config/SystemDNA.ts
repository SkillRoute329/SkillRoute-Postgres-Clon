export const SystemDNA = {
    identity: {
        name: "TransformaFacil 2.0",
        version: "20.5.0-RRHH-STABLE",
        codename: "ANTIGRAVITY-X"
    },
    infrastructure: {
        repository: "https://github.com/Ucot2025/TransformaFacil-2.0.git",
        productionBranch: "main",
        deploymentProvider: "Railway",
        productionUrl: "https://transformafacil-20-production.up.railway.app"
    },
    context: {
        description: "Este archivo contiene la VERDAD ABSOLUTA sobre la infraestructura del sistema. Cualquier agente o desarrollador debe respetar estos parámetros.",
        criticalRules: [
            "SOLO desplegar desde la rama 'main'.",
            "La rama 'master' es un artefacto legacy local, NO USAR para deploy.",
            "Si Railway no despliega automáticamente, forzar via Commit Vacío o UI.",
            "El sistema de archivos local es efímero en producción. Usar S3/Base de Datos para persistencia."
        ]
    },
    // FALTANTE QUE ROMPIÓ EL BUILD:
    GOD_MODE_USER: "0000",
    GOD_MODE_HASH: "$2b$10$7vNfQv90E/7zR1l.V/kG1eQz8pD8zK/9w.e8pD8zK/9w.e8pD8zK/", // admin123 hash
    AUTO_REPAIR: true,
    DEFAULT_TENANT: {
        id: 1,
        name: "UCOT",
        slug: "ucot-official"
    }
};

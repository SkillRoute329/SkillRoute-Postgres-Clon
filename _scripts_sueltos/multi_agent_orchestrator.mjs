/**
 * PROTOCOLO DE ORQUESTACIÓN MULTI-AGENTE UCOT v1.0
 * Inspirado en OpenAI Swarm + Model Context Protocol (MCP)
 * 
 * Este archivo demuestra cómo un Orquestador Central delega tareas 
 * a agentes especializados (Dispatcher, Mechanic, HR) instalados como skills.
 */

// 1. DEFINICIÓN DE AGENTES (INSTRUCIONES + HERRAMIENTAS)
const AGENTS = {
  ORCHESTRATOR: {
    name: "Comandante Central UCOT",
    instructions: `Eres el cerebro táctico de UCOT. Tu misión es recibir alertas y 
    decidir a qué especialista (Dispatcher, Mechanic, HR) llamar. 
    Usa jerga de transporte uruguayo ("Pisale", "Aguantá", "Está barriendo").`,
    tools: ["delegateToDispatcher", "delegateToMechanic", "delegateToHR"]
  },
  DISPATCHER: {
    name: "Agente de Línea (Shadow)",
    instructions: `Especialista en tráfico y competencia. Tu prioridad es la frecuencia 
    y evitar que el rival (CUTCSA, Coetc) nos "barra" los pasajeros.`,
    skills: ["shadow-dispatcher"]
  },
  MECHANIC: {
    name: "Ingeniero de Flota",
    instructions: `Especialista en salud vehicular. Evalúas telemetría RCM para evitar rupturas mecánicas.`,
    skills: ["mantenimiento-predictivo"]
  },
  HR: {
    name: "Gestor de Capital Humano",
    instructions: `Especialista en choferes, vencimientos de libreta y rotación de personal (Cartones).`,
    skills: ["gestion-capital-humano"]
  }
};

// 2. LÓGICA DE HANDOFF (TRASPASO)
class MultiAgentOrchestrator {
  constructor() {
    this.history = [];
    this.currentAgent = AGENTS.ORCHESTRATOR;
  }

  /**
   * Procesa la entrada y decide si hay que llamar a otro agente (Handoff)
   */
  async process(input) {
    console.log(`\n[${this.currentAgent.name}] Procesando: "${input}"`);
    
    // Simulación de razonamiento LLM para triaje
    let decision = this.evaluateTriaje(input);
    
    if (decision.nextAgent) {
      console.log(`🔄 HANDOFF: Delegando a ${AGENTS[decision.nextAgent].name}...`);
      this.currentAgent = AGENTS[decision.nextAgent];
      return this.handleSpecialist(input, decision);
    }

    return this.finalResponse("Orden directa del Comandante: " + input);
  }

  evaluateTriaje(input) {
    const text = input.toLowerCase();
    if (text.includes("rival") || text.includes("distancia") || text.includes("atrasado")) {
      return { nextAgent: "DISPATCHER", reason: "Problema de tráfico/frecuencia" };
    }
    if (text.includes("calienta") || text.includes("motor") || text.includes("falla")) {
      return { nextAgent: "MECHANIC", reason: "Problema mecánico detectado" };
    }
    if (text.includes("libreta") || text.includes("relevo") || text.includes("chofer")) {
      return { nextAgent: "HR", reason: "Problema de personal (RRHH)" };
    }
    return { nextAgent: null };
  }

  async handleSpecialist(input, decision) {
    // Aquí se llamaría a la API/Skill correspondiente
    const specialistResponse = `[${this.currentAgent.name}] Basado en la skill ${this.currentAgent.skills[0]}: Realizaré ${decision.reason}.`;
    return specialistResponse;
  }

  finalResponse(msg) {
    return `🎯 RESPUESTA FINAL: ${msg}`;
  }
}

// 3. DEMOSTRACIÓN DE USO
const ucot = new MultiAgentOrchestrator();

// ESCENARIO 1: Problema Táctico de Línea (Dispatcher)
console.log("--- ESCENARIO 1: COMPETENCIA ---");
ucot.process("El 145 de CUTCSA me está barriendo el corredor Propios a 100 metros.").then(console.log);

// ESCENARIO 2: Problema Mecánico (Mechanic)
setTimeout(() => {
  console.log("\n--- ESCENARIO 2: MECÁNICO ---");
  const ucot2 = new MultiAgentOrchestrator();
  ucot2.process("El coche 120 tiene olor a quemado y temperatura en 100 grados.").then(console.log);
}, 1000);

// ESCENARIO 3: Problema Mixto (Orquestación Compleja)
setTimeout(() => {
    console.log("\n--- ESCENARIO 3: MIXTO ---");
    console.log("(En un sistema real, el Orquestador llamaría a ambos secuencialmente)");
}, 2000);

import { AIIntelligenceService } from './frontend/src/services/aiIntelligenceService';

function runTest() {
  // Initialize fake agent
  AIIntelligenceService.agentRegistry['300'] = {
    lineId: '300',
    threatLevel: 'SAFE',
    lastAnalysis: '',
    stats: {
      totalScans: 0,
      criticalIncidents: 0,
      warnIncidents: 0,
      safeScans: 0,
      scheduleDisadvantages: 0,
      lastDetectedRivals: new Set()
    },
    // SET THE ADVANTAGE TO NEGATIVE (Rival left earlier)
    lastScheduleAdvantage: -12
  };

  const threat = {
    detected: true,
    competitorLine: '104',
    distance: 120,
    threatLevel: 'CRITICAL',
    rivalDirection: 'AHEAD',
    recommendation: 'Agujero adelante'
  };

  const response1 = AIIntelligenceService.getFastTacticalResponse('300', threat, 'Instrucciones -> Cno. Carrasco');
  console.log("TEST 1 - Rival Ahead or Advantage < 0:");
  console.log(response1);

  // Test 2
  AIIntelligenceService.agentRegistry['300'].lastScheduleAdvantage = 5;
  threat.rivalDirection = 'BEHIND';
  const response2 = AIIntelligenceService.getFastTacticalResponse('300', threat, 'Instrucciones -> Cno. Carrasco');
  console.log("\nTEST 2 - Rival Behind and Advantage > 0:");
  console.log(response2);
}

runTest();

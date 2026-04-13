/**
 * seed_ucot_completo.js
 * Seed completo UCOT usando Firebase Admin SDK (bypasea reglas de Firestore)
 * Ejecutar: node seed_ucot_completo.js
 */
const admin = require('firebase-admin');
const serviceAccount = require('./src/config/firebase-admin.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ─── DATOS ───────────────────────────────────────────────────────────────────

const FLOTA = [
  {c:'1',m:'Volvo'},{c:'2',m:'Agrale'},{c:'3',m:'Agrale'},{c:'4',m:'Agrale'},
  {c:'5',m:'Volvo'},{c:'6',m:'Agrale'},{c:'7',m:'Yutong'},{c:'8',m:'Volvo'},
  {c:'9',m:'Yutong'},{c:'10',m:'Volvo'},{c:'11',m:'Volvo'},{c:'12',m:'Yutong'},
  {c:'13',m:'Volvo'},{c:'14',m:'Yutong'},{c:'15',m:'Agrale'},{c:'16',m:'Agrale'},
  {c:'17',m:'Yutong'},{c:'18',m:'Agrale'},{c:'19',m:'Agrale'},{c:'20',m:'Volvo'},
  {c:'21',m:'Agrale'},{c:'22',m:'Agrale'},{c:'23',m:'Agrale'},{c:'24',m:'Volvo'},
  {c:'25',m:'Volvo'},{c:'26',m:'Agrale'},{c:'27',m:'Volvo'},{c:'28',m:'Agrale'},
  {c:'29',m:'Agrale'},{c:'30',m:'Agrale'},{c:'31',m:'Yutong'},{c:'32',m:'Agrale'},
  {c:'33',m:'Agrale'},{c:'34',m:'Agrale'},{c:'35',m:'Agrale'},{c:'36',m:'Volvo'},
  {c:'37',m:'Yutong'},{c:'38',m:'Yutong'},{c:'39',m:'Agrale'},{c:'40',m:'Agrale'},
  {c:'41',m:'Yutong'},{c:'42',m:'Agrale'},{c:'43',m:'Agrale'},{c:'44',m:'Agrale-Cummins'},
  {c:'45',m:'Yutong'},{c:'46',m:'Agrale'},{c:'47',m:'Volvo'},{c:'48',m:'Yutong'},
  {c:'49',m:'Agrale'},{c:'50',m:'Yutong'},{c:'51',m:'Agrale-Cummins'},{c:'52',m:'Volvo'},
  {c:'53',m:'Yutong'},{c:'54',m:'Agrale'},{c:'55',m:'Agrale'},{c:'56',m:'Agrale'},
  {c:'57',m:'Yutong'},{c:'58',m:'Yutong'},{c:'59',m:'Agrale-Cummins'},{c:'60',m:'Agrale'},
  {c:'61',m:'Agrale-Cummins'},{c:'62',m:'Yutong'},{c:'63',m:'Agrale'},{c:'64',m:'Agrale'},
  {c:'65',m:'Agrale-Cummins'},{c:'66',m:'Volvo'},{c:'67',m:'Yutong'},{c:'68',m:'Volvo'},
  {c:'69',m:'Yutong'},{c:'70',m:'Agrale'},{c:'71',m:'Volvo'},{c:'72',m:'Yutong'},
  {c:'73',m:'Volvo'},{c:'74',m:'Agrale'},{c:'75',m:'Volvo'},{c:'76',m:'Volvo'},
  {c:'77',m:'Agrale'},{c:'78',m:'Volvo'},{c:'79',m:'Yutong'},{c:'80',m:'Yutong'},
  {c:'81',m:'Yutong'},{c:'82',m:'Yutong'},{c:'83',m:'Agrale-Cummins'},{c:'84',m:'Agrale'},
  {c:'85',m:'Agrale'},{c:'86',m:'Agrale'},{c:'87',m:'Agrale-Cummins'},{c:'88',m:'Volvo'},
  {c:'89',m:'Volvo'},{c:'90',m:'Yutong'},{c:'91',m:'Volvo'},{c:'92',m:'Yutong'},
  {c:'93',m:'Yutong'},{c:'94',m:'Agrale'},{c:'95',m:'Yutong'},{c:'96',m:'Yutong'},
  {c:'97',m:'Yutong'},{c:'98',m:'Yutong'},{c:'99',m:'Volvo'},{c:'100',m:'Volvo'},
  {c:'101',m:'Agrale'},{c:'102',m:'Yutong'},{c:'103',m:'Agrale'},{c:'104',m:'Agrale'},
  {c:'105',m:'Agrale'},{c:'106',m:'Yutong'},{c:'107',m:'Yutong'},{c:'108',m:'Yutong'},
  {c:'109',m:'Yutong'},{c:'110',m:'Agrale'},{c:'111',m:'Yutong'},{c:'112',m:'Yutong'},
  {c:'113',m:'Yutong'},{c:'114',m:'Yutong'},{c:'115',m:'Yutong'},{c:'116',m:'Yutong'},
  {c:'117',m:'Yutong'},{c:'118',m:'Agrale'},{c:'119',m:'Agrale'},{c:'120',m:'Agrale'},
  {c:'121',m:'Agrale'},{c:'122',m:'Agrale'},{c:'123',m:'Agrale'},{c:'124',m:'Agrale-Cummins'},
  {c:'125',m:'Agrale-Cummins'},{c:'126',m:'Agrale-Cummins'},{c:'127',m:'Agrale-Cummins'},
  {c:'128',m:'Agrale'},{c:'129',m:'Agrale'},{c:'130',m:'Agrale'},{c:'131',m:'Agrale'},
  {c:'132',m:'Agrale'},{c:'133',m:'Agrale'},{c:'134',m:'Agrale'},{c:'135',m:'Agrale'},
  {c:'136',m:'Agrale'},{c:'137',m:'Agrale'},{c:'138',m:'Agrale'},{c:'139',m:'Agrale'},
  {c:'140',m:'Agrale'},{c:'141',m:'Agrale'},{c:'142',m:'Agrale'},{c:'143',m:'Agrale'},
  {c:'144',m:'Agrale'},{c:'145',m:'Agrale'},{c:'146',m:'Agrale'},{c:'147',m:'Agrale'},
  {c:'148',m:'Agrale'},{c:'149',m:'Agrale'},{c:'150',m:'Agrale'},{c:'151',m:'Agrale'},
  {c:'152',m:'Yutong'},{c:'153',m:'Agrale'},{c:'154',m:'Agrale-Cummins'},{c:'155',m:'Agrale-Cummins'},
  {c:'156',m:'Agrale-Cummins'},{c:'157',m:'Agrale-Cummins'},{c:'158',m:'Agrale-Cummins'},
  {c:'159',m:'Agrale-Cummins'},{c:'160',m:'Agrale-Cummins'},{c:'161',m:'Agrale-Cummins'},
  {c:'162',m:'Agrale-Cummins'},{c:'163',m:'Agrale-Cummins'},{c:'164',m:'Agrale-Cummins'},
  {c:'165',m:'Agrale-Cummins'},{c:'166',m:'Agrale-Cummins'},{c:'167',m:'Agrale-Cummins'},
  {c:'168',m:'Yutong'},{c:'169',m:'Yutong'},
  {c:'201',m:'Yutong'},{c:'202',m:'Yutong'},{c:'203',m:'Yutong'},{c:'204',m:'Yutong'},
  {c:'205',m:'Yutong'},{c:'206',m:'Yutong'},{c:'207',m:'Yutong'},{c:'208',m:'Yutong'},
  {c:'209',m:'Yutong'},{c:'210',m:'Yutong'},{c:'211',m:'Yutong'},{c:'212',m:'Yutong'},
  {c:'213',m:'Yutong'},{c:'214',m:'Yutong'},{c:'215',m:'Yutong'},
  {c:'221',m:'Mercedes Benz'},{c:'222',m:'Mercedes Benz'},{c:'223',m:'Mercedes Benz'},
  {c:'224',m:'Mercedes Benz'},{c:'226',m:'Mercedes Benz'},{c:'228',m:'Mercedes Benz'},
  {c:'230',m:'Mercedes Benz'},{c:'231',m:'Mercedes Benz'},{c:'232',m:'Mercedes Benz'},
  {c:'233',m:'Mercedes Benz'},{c:'234',m:'Mercedes Benz'},
  {c:'235',m:'Volvo'},{c:'236',m:'Volvo'},{c:'237',m:'Volvo'},{c:'238',m:'Volvo'},
  {c:'239',m:'Volvo'},{c:'240',m:'Volvo'},{c:'241',m:'Volvo'},{c:'242',m:'Volvo'},
  {c:'243',m:'Volvo'},{c:'244',m:'Agrale'},{c:'245',m:'Agrale'},{c:'246',m:'Agrale'},
  {c:'247',m:'Agrale'},{c:'248',m:'Agrale'},{c:'249',m:'Agrale'},{c:'250',m:'Agrale'},
  {c:'251',m:'Volvo'},{c:'252',m:'Volvo'},{c:'253',m:'Volvo'},{c:'254',m:'Volvo'},
  {c:'255',m:'Agrale-Cummins'},{c:'256',m:'Agrale-Cummins'},{c:'257',m:'Agrale-Cummins'},
  {c:'258',m:'Agrale-Cummins'},{c:'259',m:'Agrale-Cummins'},{c:'260',m:'Agrale-Cummins'},
  {c:'261',m:'Agrale-Cummins'},{c:'262',m:'Yutong'},{c:'263',m:'Yutong'},{c:'264',m:'Yutong'},
  {c:'265',m:'Yutong'},{c:'266',m:'Yutong'},{c:'267',m:'Yutong'},{c:'268',m:'Yutong'},
  {c:'903',m:'Mitsubishi'},{c:'909',m:'Fiat'},{c:'912',m:'Mitsubishi'},
  {c:'915',m:'Volkswagen'},{c:'916',m:'Fiat'},{c:'917',m:'Fiat'},
  {c:'918',m:'Volkswagen'},{c:'919',m:'Volvo'},{c:'920',m:'Fiat'},
  {c:'921',m:'Volkswagen'},{c:'922',m:'Volkswagen'},
  {c:'923',m:'Byd'},{c:'924',m:'Byd'},{c:'925',m:'Byd'},{c:'926',m:'Byd'},{c:'927',m:'Byd'},
  {c:'1009',m:'Volvo'},{c:'1014',m:'Volvo'},{c:'1016',m:'Volvo'},{c:'1021',m:'Volvo'},
  {c:'1050',m:'Volvo'},{c:'1053',m:'Volvo'},{c:'1055',m:'Volvo'},{c:'1057',m:'Volvo'},
  {c:'1064',m:'Volvo'},{c:'1096',m:'Volvo'},{c:'1098',m:'Volvo'},{c:'1110',m:'Volvo'},
];

function tipoFlota(marca) {
  const m = marca.toLowerCase();
  if (m.includes('yutong')) return 'yutong';
  if (m.includes('byd')) return 'aire_baterias';
  if (m.includes('mitsubishi') || m.includes('fiat') || m.includes('volkswagen')) return 'expendedora';
  return 'normal';
}

// Personal de distribución finde 12-13/04/2026
// PERSONAL — datos verificados y deduplicados por nº de interno
// Fuente: distribución fin de semana 12-13/04/2026 + planilla UCOT
// Correcciones aplicadas:
//   i:80  → PINA  (OLIVAR era duplicado — int.86 ya figura como OLIVAR)
//   i:711 → PROABBUENA  (ALTEZ era duplicado — apellido corregido)
//   i:730 → SOUMANO  (LOPEZ era duplicado — int.93 ya figura como LOPEZ)
//   i:83  → ESPERDERO  (SOPREDERO: corregido)
//   i:50  → BECERRICA  (BACTERINCA: corregido)
//   i:115 → MACCHIO  (MACLLIO: corregido)
//   i:534 → REQUEIRA  (REQUERA: normalizado igual que int.519, distinto interno)
//   i:655 → FERREYRA  (FERREYA: corregido)
const PERSONAL = [
  // Bloque A (domingo 13/04)
  {i:'12',a:'QUESADA'},{i:'13',a:'HERRERA'},{i:'24',a:'SONORA'},{i:'53',a:'PERDOMO'},
  {i:'35',a:'GONZALEZ'},{i:'47',a:'FERREIRA'},{i:'58',a:'GONZALEZ'},{i:'66',a:'BARCIA'},
  {i:'72',a:'ESCOBAR'},{i:'71',a:'CORREA'},{i:'74',a:'FERREIRA'},{i:'80',a:'PINA'},
  {i:'83',a:'ESPERDERO'},{i:'86',a:'OLIVAR'},{i:'90',a:'BRAGA'},{i:'93',a:'LOPEZ'},
  {i:'97',a:'SANGIOVANNI'},{i:'121',a:'FERREIRA'},{i:'129',a:'BOGA'},{i:'136',a:'VHEITZ'},
  {i:'144',a:'RODRIGUEZ'},{i:'143',a:'PERAZZA'},{i:'153',a:'RICCO'},{i:'170',a:'SANCHEZ'},
  {i:'171',a:'GUTIERREZ'},{i:'177',a:'FITOS'},{i:'186',a:'FERREIRA'},{i:'196',a:'CANCELA'},
  {i:'198',a:'MONTGOMERY'},{i:'231',a:'SONORA'},{i:'237',a:'MODERNELL'},{i:'325',a:'GARZABAL'},
  {i:'401',a:'AROCENA'},{i:'410',a:'PENA'},{i:'421',a:'BERMONDS'},{i:'422',a:'RENTANCOR'},
  {i:'628',a:'NUNEZ'},{i:'623',a:'RAMOS'},{i:'627',a:'LORENZI'},{i:'652',a:'DELGADO'},
  {i:'653',a:'CALDERON'},{i:'677',a:'CABRERA'},{i:'692',a:'RICARTE'},{i:'705',a:'DI LEONE'},
  {i:'706',a:'GOMEZ'},{i:'711',a:'PROABBUENA'},{i:'723',a:'RODRIGUEZ'},{i:'724',a:'PEREZ'},
  {i:'726',a:'ANDRADE'},{i:'730',a:'SOUMANO'},{i:'735',a:'FERNANDEZ'},{i:'740',a:'SUAREZ'},
  {i:'742',a:'ESCUDERO'},{i:'776',a:'CABRERA'},{i:'777',a:'MOLINARI'},{i:'788',a:'ZERBO'},
  {i:'810',a:'PINOS'},{i:'825',a:'FERNANDEZ'},{i:'857',a:'LAGOS'},{i:'858',a:'CACERES'},
  {i:'890',a:'FERREIRA'},{i:'904',a:'FERRARO'},{i:'906',a:'ALONSO'},{i:'912',a:'RECALDE'},
  {i:'914',a:'SAMPIL'},{i:'3000',a:'MARTINEZ'},{i:'3007',a:'MARTINEZ'},{i:'3009',a:'AGUERRE'},
  {i:'3015',a:'PEREZ'},{i:'3017',a:'FRANCO'},{i:'3038',a:'SALINAS'},{i:'3043',a:'DIAZ'},
  {i:'3048',a:'MUSTO'},{i:'3049',a:'ROSA'},{i:'3064',a:'RODAS'},{i:'3090',a:'TABAREZ'},
  {i:'3093',a:'CRUZ'},{i:'3098',a:'GONZALEZ'},{i:'3102',a:'LAMBION'},{i:'1104',a:'DO AMARAL'},
  {i:'1105',a:'GIMENEZ'},{i:'3110',a:'PAZ'},{i:'3111',a:'PANIZZA'},{i:'3112',a:'PEREZ'},
  {i:'3122',a:'GARRIDO'},{i:'3130',a:'RUIZ'},{i:'3138',a:'GUEVARA'},{i:'3141',a:'DIAZ'},
  {i:'3150',a:'PENA'},{i:'3160',a:'PINEIRO'},{i:'8258',a:'MARTINEZ'},
  {i:'120',a:'DE PATTI'},{i:'611',a:'FRANCO'},{i:'793',a:'DIAZ'},{i:'837',a:'SOLER'},
  {i:'3003',a:'HUQUE'},
  // Bloque B (sábado 12/04)
  {i:'15',a:'RODRIGUEZ'},{i:'18',a:'FERREIRA'},{i:'50',a:'BECERRICA'},{i:'64',a:'VAZQUEZ'},
  {i:'73',a:'CORREA'},{i:'102',a:'BURGUEZ'},{i:'107',a:'AGUIRRE'},
  {i:'115',a:'MACCHIO'},{i:'133',a:'LOZANO'},{i:'135',a:'BOGA'},{i:'134',a:'VHEITZ'},
  {i:'163',a:'RICCO'},{i:'183',a:'MONTES'},{i:'199',a:'BARRERA'},{i:'217',a:'SONORA'},
  {i:'317',a:'IRIARTE'},{i:'222',a:'AQUINO'},{i:'234',a:'LUPENA'},{i:'414',a:'MARTORANO'},
  {i:'519',a:'REQUEIRA'},{i:'502',a:'NOVA'},{i:'506',a:'SILVA'},{i:'518',a:'MARQUEZ'},
  {i:'534',a:'REQUEIRA'},{i:'655',a:'FERREYRA'},{i:'665',a:'MOREIRA'},
  {i:'782',a:'LARROSA'},{i:'854',a:'COSTA'},
];

// Deduplicar por interno (el primero prevalece — datos más confiables al inicio)
const personalUnique = [];
const seenInternos = new Set();
for (const p of PERSONAL) {
  if (!seenInternos.has(p.i)) { seenInternos.add(p.i); personalUnique.push(p); }
}

// Coche-Personal (domingo 13/04)
const COCHE_PERSONAL_RAW = [
  {c:'4',personal:[{i:'3112',a:'PEREZ',t:1},{i:'837',a:'SOLER',t:2}]},
  {c:'9',personal:[{i:'120',a:'DE PATTI',t:1}]},
  {c:'14',personal:[{i:'134',a:'VHEITZ',t:2}]},
  {c:'15',personal:[{i:'740',a:'SUAREZ',t:1}]},
  {c:'16',personal:[{i:'793',a:'DIAZ',t:2}]},
  {c:'18',personal:[{i:'611',a:'FRANCO',t:1}]},
  {c:'19',personal:[{i:'623',a:'RAMOS',t:1},{i:'825',a:'FERNANDEZ',t:2}]},
  {c:'21',personal:[{i:'24',a:'SONORA',t:2},{i:'810',a:'PINOS',t:1}]},
  {c:'22',personal:[{i:'677',a:'CABRERA',t:2}]},
  {c:'24',personal:[{i:'788',a:'ZERBO',t:1}]},
  {c:'29',personal:[{i:'3003',a:'HUQUE',t:1}]},
  {c:'30',personal:[{i:'3015',a:'PEREZ',t:1},{i:'3017',a:'FRANCO',t:2}]},
  {c:'36',personal:[{i:'705',a:'DI LEONE',t:1}]},
  {c:'38',personal:[{i:'3150',a:'PENA',t:2}]},
  {c:'39',personal:[{i:'857',a:'LAGOS',t:2}]},
  {c:'40',personal:[{i:'627',a:'LORENZI',t:2}]},
  {c:'42',personal:[{i:'170',a:'SANCHEZ',t:2}]},
  {c:'48',personal:[{i:'47',a:'FERREIRA',t:2}]},
  {c:'55',personal:[{i:'58',a:'GONZALEZ',t:1}]},
  {c:'56',personal:[{i:'706',a:'GOMEZ',t:1}]},
  {c:'57',personal:[{i:'776',a:'CABRERA',t:2}]},
  {c:'58',personal:[{i:'421',a:'BERMONDS',t:1}]},
  {c:'59',personal:[{i:'422',a:'RENTANCOR',t:1},{i:'711',a:'PROBABBUENA',t:2}]},
  {c:'60',personal:[{i:'80',a:'PINA',t:2},{i:'735',a:'FERNANDEZ',t:2},{i:'1104',a:'DO AMARAL',t:1}]},
  {c:'65',personal:[{i:'3098',a:'GONZALEZ',t:1}]},
  {c:'67',personal:[{i:'129',a:'BOGA',t:3},{i:'3049',a:'ROSA',t:2}]},
  {c:'68',personal:[{i:'3007',a:'MARTINEZ',t:2}]},
  {c:'69',personal:[{i:'912',a:'RECALDE',t:2}]},
  {c:'72',personal:[{i:'171',a:'GUTIERREZ',t:1},{i:'858',a:'CACERES',t:2}]},
  {c:'74',personal:[{i:'325',a:'GARZABAL',t:1}]},
  {c:'77',personal:[{i:'3160',a:'PINEIRO',t:2}]},
  {c:'79',personal:[{i:'177',a:'FITOS',t:2}]},
  {c:'95',personal:[{i:'3102',a:'LAMBION',t:1}]},
  {c:'96',personal:[{i:'914',a:'SAMPIL',t:2}]},
  {c:'97',personal:[{i:'3111',a:'PANIZZA',t:2}]},
  {c:'100',personal:[{i:'3064',a:'RODAS',t:1}]},
  {c:'107',personal:[{i:'906',a:'ALONSO',t:1}]},
  {c:'108',personal:[{i:'742',a:'ESCUDERO',t:2}]},
  {c:'109',personal:[{i:'724',a:'PEREZ',t:2}]},
  {c:'111',personal:[{i:'3093',a:'CRUZ',t:2}]},
  {c:'112',personal:[{i:'153',a:'RICCO',t:3}]},
  {c:'113',personal:[{i:'186',a:'FERREIRA',t:1}]},
  {c:'115',personal:[{i:'890',a:'FERREIRA',t:2}]},
  {c:'117',personal:[{i:'196',a:'CANCELA',t:2}]},
  {c:'138',personal:[{i:'730',a:'SOUMANO',t:1},{i:'904',a:'FERRARO',t:2}]},
  {c:'141',personal:[{i:'97',a:'SANGIOVANNI',t:1}]},
  {c:'142',personal:[{i:'401',a:'AROCENA',t:2}]},
  {c:'144',personal:[{i:'3138',a:'GUEVARA',t:1}]},
  {c:'150',personal:[{i:'53',a:'PERDOMO',t:1}]},
  {c:'152',personal:[{i:'410',a:'PENA',t:2}]},
  {c:'153',personal:[{i:'3000',a:'MARTINEZ',t:1}]},
  {c:'155',personal:[{i:'3130',a:'RUIZ',t:2}]},
  {c:'156',personal:[{i:'71',a:'CORREA',t:1}]},
  {c:'158',personal:[{i:'777',a:'MOLINARI',t:2}]},
  {c:'161',personal:[{i:'90',a:'BRAGA',t:2}]},
  {c:'163',personal:[{i:'72',a:'ESCOBAR',t:2},{i:'1105',a:'GIMENEZ',t:1}]},
  {c:'164',personal:[{i:'35',a:'GONZALEZ',t:1}]},
  {c:'167',personal:[{i:'237',a:'MODERNELL',t:1}]},
  {c:'176',personal:[{i:'653',a:'CALDERON',t:1}]},
  {c:'201',personal:[{i:'144',a:'RODRIGUEZ',t:2}]},
  {c:'206',personal:[{i:'3038',a:'SALINAS',t:2}]},
  {c:'207',personal:[{i:'143',a:'PERAZZA',t:1}]},
];

// Distribución domingo 13/04
const DIST_DOM = [
  {c:'4',s:'1000'},{c:'9',s:'1009'},{c:'15',s:'1044'},{c:'16',s:'1003'},
  {c:'18',s:'1003'},{c:'19',s:'1046'},{c:'21',s:'1077'},{c:'22',s:'1133'},
  {c:'24',s:'1004'},{c:'29',s:'1006'},{c:'30',s:'1081'},{c:'36',s:'1118'},
  {c:'38',s:'1118'},{c:'39',s:'1056'},{c:'40',s:'1057'},{c:'42',s:'1058'},
  {c:'48',s:'1188'},{c:'55',s:'1007'},{c:'56',s:'1007'},{c:'57',s:'1123'},
  {c:'58',s:'1068'},{c:'59',s:'1064'},{c:'60',s:'1067'},{c:'65',s:'1011'},
  {c:'67',s:'1126'},{c:'68',s:'1087'},{c:'69',s:'1127'},{c:'72',s:'1119'},
  {c:'74',s:'1060'},{c:'77',s:'1014'},{c:'79',s:'1125'},{c:'95',s:'1157'},
  {c:'96',s:'1160'},{c:'97',s:'1135'},{c:'100',s:'1073'},{c:'107',s:'1171'},
  {c:'108',s:'1103'},{c:'109',s:'1104'},{c:'111',s:'1105'},{c:'112',s:'1106'},
  {c:'113',s:'1137'},{c:'115',s:'1109'},{c:'117',s:'1106'},{c:'138',s:'1070'},
  {c:'141',s:'1133'},{c:'142',s:'1152'},{c:'144',s:'1158'},{c:'150',s:'1160'},
  {c:'152',s:'1113'},{c:'153',s:'1137'},{c:'155',s:'1029'},{c:'156',s:'1103'},
  {c:'158',s:'1032'},{c:'161',s:'1035'},{c:'163',s:'1037'},{c:'164',s:'1038'},
  {c:'167',s:'1041'},{c:'176',s:'1133'},{c:'201',s:'1194'},{c:'206',s:'1199'},
  {c:'207',s:'1191'},
];

// Distribución sábado 12/04
const DIST_SAB = [
  {c:'5',s:'3452'},{c:'9',s:'3446'},{c:'10',s:'3170'},{c:'12',s:'3107'},
  {c:'14',s:'3466'},{c:'18',s:'3509'},{c:'19',s:'3443'},{c:'27',s:'3445'},
  {c:'29',s:'3390'},{c:'38',s:'3454'},{c:'41',s:'3433'},{c:'48',s:'3426'},
  {c:'67',s:'3440'},{c:'72',s:'3450'},{c:'75',s:'3442'},{c:'80',s:'3442'},
  {c:'82',s:'3451'},{c:'90',s:'3444'},{c:'95',s:'3444'},{c:'100',s:'3170'},
  {c:'102',s:'3441'},{c:'107',s:'3421'},{c:'108',s:'3441'},{c:'111',s:'3451'},
  {c:'115',s:'3461'},{c:'117',s:'3462'},{c:'158',s:'3400'},{c:'168',s:'3423'},
  {c:'189',s:'3424'},{c:'201',s:'4597'},{c:'207',s:'4591'},{c:'268',s:'3580'},
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function writeBatched(docs) {
  const BATCH_SIZE = 400;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const { ref, data } of chunk) {
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
    console.log(`  → ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length} escritos`);
  }
}

// ─── SEEDS ───────────────────────────────────────────────────────────────────

async function seedFlota() {
  console.log('\n🚌 Flota...');
  const docs = FLOTA.map(v => ({
    ref: db.collection('vehiculos').doc(v.c),
    data: {
      id: v.c, internalNumber: v.c, marca: v.m,
      tipoFlota: tipoFlota(v.m), estado_operativo: 'ACTIVO', activo: true,
      updatedAt: new Date().toISOString(),
    }
  }));
  await writeBatched(docs);
  console.log('  ✅ Flota:', FLOTA.length, 'vehículos');
}

async function seedPersonal() {
  console.log('\n👤 Personal...');
  const docs = personalUnique.map(p => ({
    ref: db.collection('users').doc('ucot_cond_' + p.i),
    data: {
      uid: 'ucot_cond_' + p.i, internalNumber: p.i,
      lastName: p.a, fullName: p.a,
      rol: 'CONDUCTOR', role: 'conductor', roles: ['CONDUCTOR'],
      activo: true, updatedAt: new Date().toISOString(),
    }
  }));
  await writeBatched(docs);
  console.log('  ✅ Personal:', personalUnique.length, 'conductores');
}

async function seedCochePersonal() {
  console.log('\n🚌👤 CochePersonal...');
  const docs = COCHE_PERSONAL_RAW.map(cp => ({
    ref: db.collection('coche_personal').doc('cp_' + cp.c),
    data: {
      cocheInternalNumber: cp.c,
      personal: cp.personal.map(p => ({
        userId: 'ucot_cond_' + p.i,
        internalNumber: p.i,
        fullName: p.a,
        turnoBase: p.t,
        esFijo: false,
      })),
      regimen: 'semana_semana',
      bloquesSemana: [],
      activo: true,
      updatedAt: new Date().toISOString(),
    }
  }));
  await writeBatched(docs);
  console.log('  ✅ CochePersonal:', COCHE_PERSONAL_RAW.length, 'coches');
}

// Distribución hábil (lun-vie): todos los coches con personal asignado corren su servicio normal.
// Se genera automáticamente desde COCHE_PERSONAL_RAW × servicios de domingo como base hábil.
// En la práctica el Listero carga el informe real cada día via "Cargar Informe".
function buildDistHabil() {
  return DIST_DOM.map((d, i) => ({
    cocheInternalNumber: d.c,
    servicio: d.s,
    tipoFlota: 'normal',
    orden: i,
  }));
}

async function seedProgramacionSemanal() {
  console.log('\n📅 ProgramacionSemanal...');

  // Calendario real de abril 2026:
  //   Semana W15: Lun 06/04 → Dom 12/04
  //     Sábado = 11/04, Domingo = 12/04
  //   Semana W16: Lun 13/04 → Dom 19/04
  //
  const distHabil = buildDistHabil();
  const distSab   = DIST_SAB.map((d, i) => ({ cocheInternalNumber: d.c, servicio: d.s, tipoFlota: 'normal', orden: i }));
  const distDom   = DIST_DOM.map((d, i) => ({ cocheInternalNumber: d.c, servicio: d.s, tipoFlota: 'normal', orden: i }));

  const SEMANAS = [
    // W15 — Lun 06 → Dom 12 abril
    { fecha: '2026-04-06', nombre: 'Lunes',     tipo: 'habil',  semana: '2026-W15', dist: distHabil },
    { fecha: '2026-04-07', nombre: 'Martes',    tipo: 'habil',  semana: '2026-W15', dist: distHabil },
    { fecha: '2026-04-08', nombre: 'Miercoles', tipo: 'habil',  semana: '2026-W15', dist: distHabil },
    { fecha: '2026-04-09', nombre: 'Jueves',    tipo: 'habil',  semana: '2026-W15', dist: distHabil },
    { fecha: '2026-04-10', nombre: 'Viernes',   tipo: 'habil',  semana: '2026-W15', dist: distHabil },
    { fecha: '2026-04-11', nombre: 'Sabado',    tipo: 'sabado', semana: '2026-W15', dist: distSab   },
    { fecha: '2026-04-12', nombre: 'Domingo',   tipo: 'domingo',semana: '2026-W15', dist: distDom   },
    // W16 — Lun 13 → Dom 19 abril
    { fecha: '2026-04-13', nombre: 'Lunes',     tipo: 'habil',  semana: '2026-W16', dist: distHabil },
    { fecha: '2026-04-14', nombre: 'Martes',    tipo: 'habil',  semana: '2026-W16', dist: distHabil },
    { fecha: '2026-04-15', nombre: 'Miercoles', tipo: 'habil',  semana: '2026-W16', dist: distHabil },
    { fecha: '2026-04-16', nombre: 'Jueves',    tipo: 'habil',  semana: '2026-W16', dist: distHabil },
    { fecha: '2026-04-17', nombre: 'Viernes',   tipo: 'habil',  semana: '2026-W16', dist: distHabil },
    { fecha: '2026-04-18', nombre: 'Sabado',    tipo: 'sabado', semana: '2026-W16', dist: distSab   },
    { fecha: '2026-04-19', nombre: 'Domingo',   tipo: 'domingo',semana: '2026-W16', dist: distDom   },
  ];

  const batch = db.batch();
  for (const dia of SEMANAS) {
    batch.set(db.collection('programacion_semanal').doc(`ps_${dia.fecha}`), {
      fecha: dia.fecha,
      semanaISO: dia.semana,
      diaNombre: dia.nombre,
      tipoDia: dia.tipo,
      distribuciones: dia.dist,
      enMantenimiento: [],
      totalServicios: dia.dist.length,
      totalParalizas: 0,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, { merge: true });
  }
  await batch.commit();
  console.log('  ✅ ProgramacionSemanal: 14 días — W15 (06-12/04) + W16 (13-19/04)');
}

// ─── CREAR USUARIO ADMIN EN FIREBASE AUTH ─────────────────────────────────────

async function seedAdminAuth() {
  console.log('🔑 Firebase Auth admin...');
  const authAdmin = admin.auth();
  const email = '1000@ucot.internal';
  const password = 'Ucot2025!';
  try {
    const existing = await authAdmin.getUserByEmail(email).catch(() => null);
    if (existing) {
      await authAdmin.updateUser(existing.uid, { password });
      console.log('  → usuario actualizado, uid:', existing.uid);
    } else {
      const user = await authAdmin.createUser({ uid: '1000', email, password, displayName: 'Admin UCOT' });
      console.log('  → usuario creado, uid:', user.uid);
    }
    // Asegurar el doc users/1000 con rol admin
    await db.collection('users').doc('1000').set({
      uid: '1000', email, rol: 'admin', role: 'admin',
      datos_personales: { nombre: 'Admin', apellido: 'UCOT' },
      datos_empresa: { legajo: '1000' },
    }, { merge: true });
    console.log('  ✅ Auth admin: 1000@ucot.internal / Ucot2025!');
  } catch (e) {
    console.error('  ⚠️ seedAdminAuth error:', e.message);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 UCOT Seed Completo — iniciando...');
  try {
    await seedFlota();
    await seedPersonal();
    await seedCochePersonal();
    await seedProgramacionSemanal();
    await seedAdminAuth();
    console.log('\n✅ SEED COMPLETO OK');
  } catch (e) {
    console.error('\n❌ Error:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

main();

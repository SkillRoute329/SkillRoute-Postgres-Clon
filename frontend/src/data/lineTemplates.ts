import type { ServiceDefinitionData } from '../components/DigitalCarton';

export const line300Data: ServiceDefinitionData = {
    serviceNumber: 'MATRIZ-300-IDA',
    line: '300',
    title: 'CRIO. CENTRAL -> INSTRUCCIONES',
    startTime: '05:12',
    startLocationDescription: 'Cementerio Central',
    endTime: '06:16',
    headers: [
        { id: 'h1', location: 'Crio. Central', isStop: true },
        { id: 'h2', location: 'Bv Artigas / Zuñiga', isStop: true },
        { id: 'h3', location: 'Tres Cruces', isStop: true },
        { id: 'h4', location: '8 oct / JB Ordoñez', isStop: true },
        { id: 'h5', location: 'Ramon Castriz', isStop: true },
        { id: 'h6', location: 'Intercamb Bell', isStop: true },
        { id: 'h7', location: 'Gral Flores', isStop: true },
        { id: 'h8', location: 'Instrucc y Bell', isStop: true },
    ],
    rows: [
        { id: 'r1', times: { h1: '05:12', h2: '05:21', h3: '05:31', h4: '05:41', h5: '05:49', h6: '05:52', h7: '06:01', h8: '06:16' }, serviceNumber: '1004' },
        { id: 'r2', times: { h1: '05:35', h2: '05:44', h3: '05:54', h4: '06:05', h5: '06:14', h6: '06:17', h7: '06:25', h8: '06:41' }, serviceNumber: '1052' },
        { id: 'r3', times: { h1: '05:54', h2: '06:03', h3: '06:13', h4: '06:24', h5: '06:33', h6: '06:36', h7: '06:44', h8: '07:00' }, serviceNumber: '1006' },
        { id: 'r4', times: { h1: '06:06', h2: '06:16', h3: '06:26', h4: '06:37', h5: '06:46', h6: '06:49', h7: '06:58', h8: '07:15' }, serviceNumber: '1103' },
        { id: 'r5', times: { h1: '06:22', h2: '06:32', h3: '06:42', h4: '06:53', h5: '07:02', h6: '07:05', h7: '07:14', h8: '07:31' }, serviceNumber: '1026' },
        { id: 'r6', times: { h1: '06:34', h2: '06:44', h3: '06:54', h4: '07:05', h5: '07:14', h6: '07:17', h7: '07:27', h8: '07:44' }, serviceNumber: '1021' },
        { id: 'r7', times: { h1: '', h2: '', h3: 'Corrales', h4: '07:22', h5: '07:25', h6: '', h7: '07:35', h8: '07:52' }, serviceNumber: '1014' },
        { id: 'r8', times: { h1: '06:48', h2: '06:58', h3: '07:09', h4: '07:20', h5: '07:29', h6: '07:32', h7: '07:42', h8: '07:59' }, serviceNumber: '1007' }
    ],
    reliefs: [],
    totalHours: '00:00',
    waitingTime: '00:00',
    liquidHours: '00:00',
    kilometers: '0'
};

export const line300ReverseData: ServiceDefinitionData = {
    serviceNumber: 'MATRIZ-300-VUELTA',
    line: '300',
    title: 'INSTRUCCIONES -> CRIO. CENTRAL',
    startTime: '04:35',
    startLocationDescription: 'Instrucciones y Belloni',
    endTime: '05:43',
    headers: [
        { id: 'h1', location: 'Instrucc y Bell', isStop: true },
        { id: 'h2', location: 'Gral Flores', isStop: true },
        { id: 'h3', location: 'Intercamb Bell', isStop: true },
        { id: 'h4', location: '20 de Febrero', isStop: true },
        { id: 'h5', location: '8 oct / JB Ordoñez', isStop: true },
        { id: 'h6', location: 'Tres Cruces', isStop: true },
        { id: 'h7', location: 'B.Nardone', isStop: true },
        { id: 'h8', location: 'Crio. Central', isStop: true },
    ],
    rows: [
        { id: 'r1', times: { h1: '04:35', h2: '04:51', h3: '05:01', h4: '05:05', h5: '05:12', h6: '05:23', h7: '05:33', h8: '05:43' }, serviceNumber: '2210' },
        { id: 'r2', times: { h1: '05:04', h2: '05:19', h3: '05:29', h4: '05:34', h5: '05:41', h6: '05:52', h7: '06:02', h8: '06:12' }, serviceNumber: '2283' },
        { id: 'r3', times: { h1: '05:26', h2: '05:41', h3: '05:51', h4: '05:56', h5: '06:03', h6: '06:14', h7: '06:24', h8: '06:34' }, serviceNumber: '2289' },
        { id: 'r4', times: { h1: '05:48', h2: '06:03', h3: '06:13', h4: '06:18', h5: '06:25', h6: '06:36', h7: '06:46', h8: '06:56' }, serviceNumber: '2285' },
        { id: 'r5', times: { h1: '06:09', h2: '06:24', h3: '06:34', h4: '06:39', h5: '06:46', h6: '06:57', h7: '09', h8: '07:19' }, serviceNumber: '2200' },
        { id: 'r6', times: { h1: '06:29', h2: '06:45', h3: '06:55', h4: '07:00', h5: '07:07', h6: '07:18', h7: '07:28', h8: '07:38' }, serviceNumber: '2201' },
        { id: 'r7', times: { h1: '06:48', h2: '07:04', h3: '07:14', h4: '07:19', h5: '07:26', h6: '07:37', h7: '07:47', h8: '07:57' }, serviceNumber: '2288' },
        { id: 'r8', times: { h1: '07:09', h2: '07:25', h3: '07:35', h4: '07:40', h5: '07:47', h6: '07:58', h7: '08:08', h8: '08:18' }, serviceNumber: '2210' },
        { id: 'r9', times: { h1: '07:27', h2: '07:43', h3: '07:53', h4: '07:58', h5: '08:05', h6: '08:16', h7: '08:26', h8: '08:36' }, serviceNumber: '2277' },
    ],
    reliefs: [],
    totalHours: '00:00',
    waitingTime: '00:00',
    liquidHours: '00:00',
    kilometers: '0'
};

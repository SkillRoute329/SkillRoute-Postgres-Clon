import sqlDb from '../config/database';
import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { prepareRowForWrite, handleStockDecrement } from '../controllers/dbBridgeController';

async function testEamBridge() {
  console.log('🧪 Iniciando pruebas unitarias/integración de EAM Bridge...');

  // 1. Probar prepareRowForWrite con fixedFilter y data_jsonb
  console.log('1. Probando prepareRowForWrite...');
  const mockCfg = {
    table: 'universal',
    pkCol: 'id',
    idAuto: true,
    fixedFilter: { tipo: 'parts' }
  };
  const mockBody = {
    sku: 'TEST-SKU-99',
    description: 'Pastilla de prueba unitaria',
    currentStock: 10,
    minStock: 2,
    location: 'Estanteria X',
    unitCost: 150
  };
  const mockId = 'part_test_' + uuidv4().slice(0, 8);

  const row = await prepareRowForWrite(mockCfg, mockBody, mockId, false);
  
  console.log('   - Fila preparada:', JSON.stringify(row));
  assert.strictEqual(row.id, mockId, 'El ID de la fila debe coincidir');
  assert.strictEqual(row.tipo, 'parts', 'El campo tipo debe corresponder al fixedFilter');
  assert.ok(row.data_jsonb, 'data_jsonb debe estar presente');
  
  const data = typeof row.data_jsonb === 'string' ? JSON.parse(row.data_jsonb) : row.data_jsonb;
  assert.strictEqual(data.sku, 'TEST-SKU-99', 'El SKU debe estar empaquetado en data_jsonb');
  assert.strictEqual(data.currentStock, 10, 'El currentStock debe estar en data_jsonb');
  assert.strictEqual(row.sku, undefined, 'El SKU no debe estar en las columnas principales');

  // 2. Probar handleStockDecrement y decremento de stock
  console.log('2. Probando handleStockDecrement...');
  
  // Insertar la parte de prueba en la base de datos
  await sqlDb('universal').insert(row);
  console.log('   - Repuesto de prueba insertado.');

  // Decrementar 3 unidades
  await handleStockDecrement(
    [{ partId: mockId, quantity: 3 }],
    'ticket_test_123',
    'incidencias'
  );

  // Consultar la base de datos para verificar el nuevo stock
  const updatedPart = await sqlDb('universal').where('id', mockId).first();
  assert.ok(updatedPart, 'El repuesto debe existir en la BD');
  const updatedData = typeof updatedPart.data_jsonb === 'string'
    ? JSON.parse(updatedPart.data_jsonb)
    : updatedPart.data_jsonb;

  console.log(`   - Stock anterior: 10 | Cantidad decrementada: 3 | Nuevo stock: ${updatedData.currentStock}`);
  assert.strictEqual(Number(updatedData.currentStock), 7, 'El stock actual debe ser 7 (10 - 3)');

  // 3. Probar alerta automática cuando el stock cae por debajo de minStock
  console.log('3. Probando generación de alerta de stock crítico...');

  // Decrementar 6 unidades adicionales (nuevo stock: 7 - 6 = 1, minStock es 2)
  await handleStockDecrement(
    [{ partId: mockId, quantity: 6 }],
    'ticket_test_123',
    'incidencias'
  );

  const finalPart = await sqlDb('universal').where('id', mockId).first();
  const finalData = typeof finalPart.data_jsonb === 'string'
    ? JSON.parse(finalPart.data_jsonb)
    : finalPart.data_jsonb;

  console.log(`   - Stock final: ${finalData.currentStock} (min: 2)`);
  assert.strictEqual(Number(finalData.currentStock), 1, 'El stock final debe ser 1');

  // Verificar si se creó una alerta en alertas_operativas
  const alert = await sqlDb('alertas_operativas')
    .where('tipo', 'cobertura_critica')
    .where('titulo', 'like', `%${mockBody.sku}%`)
    .first();

  assert.ok(alert, 'Debe haberse creado una alerta de stock crítico para el SKU de prueba');
  console.log('   - Alerta creada con éxito:', alert.titulo);
  console.log('     Mensaje:', alert.mensaje);
  assert.strictEqual(alert.urgencia, 'alta', 'La urgencia de la alerta debe ser alta');

  // 4. Limpieza de registros de prueba
  console.log('4. Limpiando registros de prueba...');
  await sqlDb('universal').where('id', mockId).delete();
  await sqlDb('alertas_operativas').where('id', alert.id).delete();
  console.log('   - Registros de prueba eliminados.');

  console.log('✅ Todas las pruebas de EAM Bridge pasaron con éxito.');
}

testEamBridge()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error ejecutando pruebas de EAM Bridge:', err);
    process.exit(1);
  });

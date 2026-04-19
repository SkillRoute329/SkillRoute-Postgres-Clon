# Skills del Equipo

## Skill: JSF Session Management
Para consumir el portal de horarios STM (PrimeFaces/JSF):
1. GET a la URL base → obtener Set-Cookie header
2. Extraer ViewState del HTML:
   regex: /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/
3. POST con las cookies + ViewState en el body
4. Parsear XML: extraer CDATA del <update id="javax.faces.ViewRoot">
5. Del HTML en el CDATA: buscar <tr class="...stm-datatable">

## Skill: Haversine Distance
Para calcular distancia entre dos puntos GPS:
  R = 6371 (km)
  dLat = (lat2-lat1) * PI/180
  dLng = (lng2-lng1) * PI/180
  a = sin(dLat/2)² + cos(lat1*PI/180) * cos(lat2*PI/180) * sin(dLng/2)²
  distancia = R * 2 * atan2(sqrt(a), sqrt(1-a))

## Skill: Uruguay Day Type Resolver
Feriados fijos 2026:
  01/01, 06/01, 19/04, 22/04, 01/05, 18/05, 19/06,
  18/07, 25/08, 12/10, 02/11, 08/12, 25/12
Semana de Turismo 2026: 30/03 al 05/04 → forzar 'Domingos'
Semana de Carnaval 2026: 16/02 al 17/02 → forzar 'Domingos'
Prioridad: períodos especiales > feriados > domingo > sábado > hábil

## Skill: GeoJSON STM Parser
Cada feature del GPS tiene:
  properties.codigoEmpresa → número empresa
  properties.linea → "306", "370", etc.
  properties.sublinea → nombre recorrido
  properties.codigoBus → número del bus
  properties.velocidad → km/h
  geometry.coordinates → [longitud, latitud] (¡orden invertido!)
Filtro coordenadas válidas: lat > -90 && lat < 0 && lng > -90 && lng < 0

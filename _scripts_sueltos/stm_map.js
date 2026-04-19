var map;
var ocioVector = [];
var viajesVector = [];
var vectorPControlOrigenDestino = [];
var layerPControlOrigenDestino;
var vectorPControl = [];
var layerPControl;
var paradaVarianteVector = [];
var vectorLayer;
var paradaVarianteLayer;
var vectorOcioLayer;
var featuresLineaViajes = [];
var featuresLineaOciosas = [];
var vectorLineaViaje;
var vectorLineaOcio;
var acercamiento = 400;
var lineas = new Array();
var lineaVisibleAnterior = undefined;
var salvaLineas = new Array();
var salvaLineasCombinacion = new Array();
var estaLayer = [];
var combinacionLayer = [];
var esteSource = [];
var combinacionSource = [];
var varianteLineas = [];
var testLayer;
var sourceCollection;

var arregloPath = [];
var mark;

var arregloViajesOcupado = [];
var arregloViajesLibres = [];
var arregloUnionviajes = [];
var ascenso = true;

// malla
var capasWMS = [1000000];
var capasParadas = [1000000];
var zoomParadas = 8;
var layer_ida_vuelta = [1000000];
var prendido_apagado = [1000000];
var mostrar = 'I';
var view;
var alternar = 'V';
var salvaParadas = [];
var zAnterior = [];

function init() {
	var wmsSource = new ol.source.TileWMS({
		url: env.MAP_IMM,
		params: { 'LAYERS': 'stm_carto_basica', 'TILED': true },
		serverType: 'geoserver',
		crossOrigin: 'anonymous'
	});

	var wmsLayer = new ol.layer.Tile({
		source: wmsSource
	});
	var projection = new ol.proj.Projection({
		code: 'EPSG:32721',
		extent: [286681, 5892788, 873206, 6505879],
		units: 'm'
	});

	view = new ol.View({
		projection: projection,
		center: [575957.24545, 6142837.70040],
		zoom: 5,
		minZoom: 3,
		maxZoom: 16
	});

	var layer1 = new ol.layer.Vector({
		name: 'cat1',
		source: new ol.source.Vector({
			format: new ol.format.GeoJSON()
		})
	});

	var layer2 = new ol.layer.Vector({
		name: 'cat2',
		source: new ol.source.Vector({
			format: new ol.format.GeoJSON()
		})
	});

	map = new ol.Map({
		layers: [wmsLayer],
		controls: [
			new ol.control.Zoom({ zoomInTipLabel: "Acercar", zoomOutTipLabel: "Alejar" }),
			layer1, layer2
		],
		target: 'map',
		view: view
	});

	var content = document.getElementById('popup-content');
	var container = document.getElementById('popup');
	var overlay = new ol.Overlay({
		element: container,
		autoPan: true,
		autoPanAnimation: {
			duration: 250
		}
	});
	map.addOverlay(overlay);

	var closer = document.getElementById('popup-closer');
	closer.onclick = function() {
		overlay.setPosition(undefined);
		closer.blur();
		return false;
	};

	var content = document.getElementById('popup-content');

	map.on('click', function(evt) {
		var iconFeatureA = map.getFeaturesAtPixel(evt.pixel, {
			hitTolerance: 5
		});
		if (iconFeatureA !== null) {
			var adres = iconFeatureA[0].get("txt");
			var datos = descomponerObjet(iconFeatureA[0]);
			if (datos !== undefined) {
				var coordinate = evt.coordinate;
				content.innerHTML = datos;
				overlay.setPosition(coordinate);
				return;
			}
			if (adres === undefined) {
				overlay.setPosition(undefined);
				closer.blur();
				return false;
			} else {
				// descomponerTxt(adres);
				var coordinate = evt.coordinate;
				content.innerHTML = adres;
				overlay.setPosition(coordinate);
			}
		}
	});

	map.on('moveend', function(evt) {
		var zoom = map.getView().getZoom();
		if (zoom > 1) {// 7 1
			setFeatureVectorViajes(true);
			setFeatureVectorParadasVariante(true);
			if (testLayer !== undefined) {
				if (testLayer.getVisible() == false) {
					testLayer.setVisible(true);
				}
			}
		} else {
			setFeatureVectorParadasVariante(false);
			setFeatureVectorViajes(false);
			if (testLayer !== undefined) {
				testLayer.setVisible(false);
			}
		}
		var index_ = 0;
		if (map.getView().getZoom() > zoomParadas) {
			var t = salvaParadas.length;
			salvaParadas.forEach(function(tupla) {
				cargarParadasVariante(tupla['c'], tupla['t'], tupla['a'], tupla['z']);
			});
			salvaParadas = [];
		}
		controlarParadas(zoom > zoomParadas);
	});
}

var codAscenso;
var codDescenso;
var codPrecarga = [];
var index_ = 0;

function precarga(codigos) {
	codPrecarga = codigos.split(",");

}
// Mapa de la red
function controlarParadas(op) {
	for (var i = 1; i < capasParadas.length; i++) {
		var layer = capasParadas[i];
		if (layer != undefined) {
			if (layer_ida_vuelta[layer.ol_uid] !== undefined) {
				cambiarVisible(layer.ol_uid, i);
			}
		}
	}
}
// Mapa de la red
function cambiarVisible(ol_uid, codigo) {
	var general = map.getLayers().array_;
	for (var i = 0; i < general.length; i++) {
		var layer = general[i];
		if (layer.ol_uid == ol_uid) {
			if (map.getView().getZoom() > zoomParadas) {
				if (mostrar == 'T' || layer_ida_vuelta[layer.ol_uid] == mostrar) {
					var cwms = capasWMS[codigo];
					if (cwms !== undefined && cwms.getVisible()) {
						layer.setVisible(true);
					} else {
						layer.setVisible(false);
					}
					break;
				} else {
					layer.setVisible(false);
					break;
				}
			} else {
				layer.setVisible(false);
				break;
			}
		}
	}
}
// Mapa de la red
function getNombrePublicoLinea(parada) {
	try {
		var ps = parada.values_.source.idIndex_;
		var desc_linea = ps[0].values_.desc_linea;
		var variante = ps[0].values_.cod_variante;
		return 'Línea: ' + desc_linea + ' Variante: ' + variante;
	} catch (e) {
		return null;
	}
	// var parada = capasParadas[codigo];
	// var desc_linea = getNombrePublicoLinea(parada);
}

var wms_layer = null;
var control_layer = null;
// Mapa de la red
function borrarWms() {
	if (wms_layer != null) {
		map.removeLayer(wms_layer);
	}
	if (control_layer != null) {
		map.removeLayer(control_layer);
	}
}
// Mapa de la red
function test(codigos) {
	borrarWms();
	var filter = 'cod_variante%20in%20(' + codigos + ')';
	var wms_source = new ol.source.TileWMS({
		url: geoserver.CAPA_TEST + filter,
		serverType: 'geoserver'
	});
	wms_layer = new ol.layer.Tile({
		source: wms_source,
		visible: true
	});
	map.addLayer(wms_layer);
	// cargarPuntosControl(codigos);
}

function cargarPuntosControl(codigos) {
	var wms_source = new ol.source.TileWMS({
		url: geoserver.CAPA_PUNTOS_CONTROL + codigos + geoserver.CAPA_PUNTOS_CONTROL_CIERRE,
		serverType: 'geoserver'
	});
	control_layer = new ol.layer.Tile({
		source: wms_source,
		visible: true,
		zIndex: 5
	});
	map.addLayer(control_layer);
}

// Consulta Movilidad
function consultaMovilidadVariante(codigo, color, desc_linea) {
	var lineastyle = [];
	lineastyle = [
		new ol.style.Style({
			stroke: new ol.style.Stroke({
				color: color,
				width: 6,
			}),
			text: new ol.style.Text({
				text: desc_linea,
				font: '15px Calibri,sans-serif',
				placement: 'point',
				fill: new ol.style.Fill({
					color: '#000',
				}),
				stroke: new ol.style.Stroke({
					color: '#fff',
					width: 3,
				}),
			})
		})
	];
	var sourceCollection = new ol.source.Vector({
		format: new ol.format.GeoJSON(),
		url: geoserver.CAPA_VARIANTE_CQL_FILTER + codigo + geoserver.CAPA_VARIANTE_CQL_FILTER_CIERRE,
	});
	var recorrido_layer = new ol.layer.Vector({
		source: sourceCollection,
		style: lineastyle,
		zIndex: 1
	});
	map.addLayer(recorrido_layer);
}

/**
 * Se encarga de levantar un TileWS del geoserver y adicionarlo al mapa
 * 
 * @param codigo
 *            de la variante
 * @param tipo
 *            si es de ida o vuelta
 * @param min
 *            para el zoom de las paradas
 * @param max
 *            para el zoom de las paradas
 * @returns
 */
// Mapa de la red
function cargarRecorridoVarianteImagen(codigo, tipo, min, max, agregar, combo, nombre) {
	var extent = [];
	var recorrido_layer;
	var error = false;
	var z;
	mostrar = tipo;
	if (capasWMS[codigo] != undefined) {
		recorrido_layer = capasWMS[codigo];
		var t = layer_ida_vuelta[recorrido_layer.ol_uid];
		var general = map.getLayers().array_;
		for (var i = 0; i < general.length; i++) {
			var layer = general[i];
			if (layer.ol_uid == recorrido_layer.ol_uid) {
				if (tipo == 'T' || tipo == t) {
					layer.setVisible(true);
					break;
				} else {
					layer.setVisible(false);
					break;
				}
			}
		}
	} else {
		var col;
		switch (combo) {
			case '1':
				if (agregar == 'I') {
					col = '#0095ff';
				} else {
					col = '#a0c7e4';
				}
				z = 3;
				break;
			case '2':
				if (agregar == 'I') {
					col = '#f06a00';
				} else {
					col = '#f4a363';
				}
				z = 2;
				break;
			case '3':
				if (agregar == 'I') {
					col = '#30fa74';
				} else {
					col = '#86e1a5';
				}
				z = 1;
				break;
			default:
				col = '#673ab7';
				break;
		}
		var desc_linea = nombre;
		const lineastyle = new ol.style.Style({
			stroke: new ol.style.Stroke({
				color: col,
				width: 6,
			}),
			text: new ol.style.Text({
				text: desc_linea,
				font: '15px Calibri,sans-serif',
				placement: 'point',
				// placement: 'line',
				fill: new ol.style.Fill({
					color: '#000',
				}),
				stroke: new ol.style.Stroke({
					color: '#fff',
					width: 3,
				}),
			})
		});
		// ];
		var sourceCollection = new ol.source.Vector({
			format: new ol.format.GeoJSON(),
			url: geoserver.CAPA_VARIANTE_CQL_FILTER + codigo + geoserver.CAPA_VARIANTE_CQL_FILTER_CIERRE,
		});
		recorrido_layer = new ol.layer.Vector({
			declutter: true,
			source: sourceCollection,
			style: lineastyle,
			zIndex: z
		});
		if (tipo == 'T' || tipo == agregar) {
			recorrido_layer.setVisible(true);
		} else {
			recorrido_layer.setVisible(false);
		}
		map.addLayer(recorrido_layer);
		layer_ida_vuelta[recorrido_layer.ol_uid] = agregar;

		// cargarPuntosControl(codigo); esto es para el tema de mostrar las minutas y
		// horarios

	}
	capasWMS[codigo] = recorrido_layer;
	// cargarParadasVariante(codigo,tipo,agregar);
	if (capasParadas[codigo] == undefined) {
		var datosParada = {
			c: codigo,
			t: tipo,
			a: agregar,
			z: z
		}
		salvaParadas.push(datosParada);
	}
}

function realizarZoom() {
	if (map.getView().getZoom() > zoomParadas) {
		salvaParadas.forEach(function(tupla) {
			cargarParadasVariante(tupla['c'], tupla['t'], tupla['a'], tupla['z']);
		});
		salvaParadas = [];
	}
	var centro = map.getView().getCenter();
	map.getView().setCenter([centro[0] + 5, centro[1]]);
	if (screen.width < 1366) {
		document.body.scrollTop = 450;
		document.documentElement.scrollTop = 450;
	}
}

var pOrigen;
var pDestino;
// Consulta Movilidad
function zoomAnimateParadas(x1, y1, z, d) {
	map.getView().animate({
		center: [x1, y1],
		duration: d,
		zoom: z
	});
}

/**
 * 
 * @param codigo
 *            de la variante
 * @param tipo
 * @param min
 *            para el zoom de la parada
 * @param max
 *            para el zoom de la parada
 * @returns
 */
// Mapa de la red
function cargarParadasVariante(codigo, tipo, agregar, z) {
	var paradas_layer;
	var error = false;
	if (capasParadas[codigo] != undefined) {
		controlarParadas(true);
	} else {
		var img = dir.ICON_PARADA;
		var style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					scale: 1,
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img
				}))
			}),
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 0.5,
					fill: new ol.style.Fill({ color: '#6f93bc' }),
					stroke: new ol.style.Stroke({
						color: '#6f93bc',
						width: 0.5
					})
				})
			})
		];
		var v_uptu_paradas = '?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_paradas';
		var filter = '&CQL_FILTER=cod_variante=' + codigo + '&outputFormat=application/json&srsname=EPSG%3A32721';
		sourceCollection = new ol.source.Vector({
			format: new ol.format.GeoJSON(),
			url: geoserver.CAPA_PARADAS_VARIANTE + v_uptu_paradas + filter
		});
		var paradas_layer = new ol.layer.Vector({
			source: sourceCollection,
			style: style,
			visible: false,
			zIndex: z
		});
		layer_ida_vuelta[paradas_layer.ol_uid] = agregar;
		map.addLayer(paradas_layer);
		capasParadas[codigo] = paradas_layer;
	}
}
// Mapa de la red
function apagar(codigo) {
	var cwms;
	var cp;
	if (capasWMS[codigo] != undefined) {
		var l = capasWMS[codigo];
		l.setVisible(false);
		capasWMS[codigo] = l;
		cwms = l.ol_uid;
	}
	if (capasParadas[codigo] != undefined) {
		var l = capasParadas[codigo];
		l.setVisible(false);
		capasParadas[codigo] = l;
		cp = l.ol_uid;
	}
	var general = map.getLayers().array_;
	for (var i = 0; i < general.length; i++) {
		var layer = general[i];
		if (cwms !== undefined && layer.ol_uid == cwms) {
			layer.setVisible(false);
		}
		if (cp !== undefined && layer.ol_uid == cp) {
			layer.setVisible(false);
		}
	}
}

function getValor(inicio, feature, cierre) {
	if (feature != undefined) {
		var res = inicio + "" + feature + "" + cierre;
		return res;
	}
	return "";
}

var testExtent = [];
// Consulta Movilidad
function cargarParadasConsultaMovilidad(codigo) {
	var img = dir.ICON_PARADA; // ICON_ORIGEN
	var style = [
		new ol.style.Style({
			image: new ol.style.Icon(({
				scale: 1,
				rotateWithView: true,
				rotation: 360 * Math.PI / 180,
				anchor: [0.5, 1],
				anchorXUnits: 'fraction',
				anchorYUnits: 'fraction',
				opacity: 0.95,
				src: img
			}))
		}),
		new ol.style.Style({
			image: new ol.style.Circle({
				radius: 0.5,
				fill: new ol.style.Fill({ color: '#6f93bc' }),
				stroke: new ol.style.Stroke({
					color: '#6f93bc',
					width: 0.1
				})
			})
		})
	];
	var v_uptu_paradas = '?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_paradas';
	var filter = '&CQL_FILTER=cod_variante=' + codigo + '&outputFormat=application/json&srsname=EPSG%3A32721';
	sourceCollection = new ol.source.Vector({
		format: new ol.format.GeoJSON(),
		url: geoserver.CAPA_PARADAS_VARIANTE + v_uptu_paradas + filter
	});
	var paradas_layer = new ol.layer.Vector({
		source: sourceCollection,
		style: style,
		zIndex: 2
	});
	map.addLayer(paradas_layer);
}

/**
 * Extrae del feature seleccionado los datos para mostrar en el popup.
 * 
 * @param featureSeleccionada
 * @returns
 */
function descomponerObjet(feature) {
	if (feature.id_ === undefined) {
		return undefined;
	}
	var panel = "";
	panel += getValor("<p><span class=key>Comentario</span> :<span class=value> ", feature.values_.comentario_ubic_deshabilitada, "</span></p>");
	panel += getValor("<p><span class=key>Descripción</span> :<span class=value> ", feature.values_.desc_ubic_parada, "</span></p>");
	panel += getValor("<p><span class=key>Fecha Desde</span> :<span class=value> ", feature.values_.fecha_desde_ubic_deshabilitada, "</span></p>");
	panel += getValor("<p><span class=key>Fecha Hasta</span> :<span class=value> ", feature.values_.fecha_hasta_ubic_deshabilitada, "</span></p>");

	panel += getValor("<p><span class=key>Línea</span> :<span class=value> ", feature.values_.desc_linea, "</span></p>");
	panel += getValor("<p><span class=key>Variante</span> :<span class=value> ", feature.values_.cod_variante, "</span></p>");
	panel += getValor("<p><span class=key>Código parada</span> :<span class=value> ", feature.values_.cod_ubic_parada, "</span></p>");
	panel += getValor("<p><span class=key>Ordinal</span> :<span class=value> ", feature.values_.ordinal, "</span></p>");
	panel += getValor("<p><span class=key>Calle</span> :<span class=value> ", feature.values_.calle, "</span></p>");
	panel += getValor("<p><span class=key>Esquina</span> :<span class=value> ", feature.values_.esquina, "</span></p>");
	if (feature.values_.desc_linea !== undefined) {
		panel += "<p><span class=key>Accesibilidad</span> :<span class=value>" +
			"<a href=https://m.montevideo.gub.uy/comoir/parada?numero=" + feature.values_.cod_ubic_parada + " target='_blank' title='Rutas de ómnibus que circulan por esta parada.'>" +
			" Cómo ir <img src=" + dir.ICON_ACCESIBLE + " class='icono-ruta' ></img></a></span></p>";
	}
	return panel;
}

function descomponerTxt(txt) {
	var texto = txt.substring(
		txt.lastIndexOf("{") + 1,
		txt.lastIndexOf("}")
	);
	var partes = texto.split(":");
	var codigo = partes[0];
	var descripcion = partes[1];
}

function resetear() {
	ascenso = true;
	$('a.botonGuardar').addClass('hide');
	$('input.ascenso').val('');
	$('input.ascensoTexto').val('');
	$('input.descenso').val('');
	$('input.descensoTexto').val('');
}


/*
 * Tema puntos de control con horarios
 * https://intranet.imm.gub.uy/catalogo-de-aplicaciones?title=minu
 * http://prodtmp.imm.gub.uy:8080/stmMinutasWEB/pages/visualizarRecorrido.xhtml
 * http://geoserver.imm.gub.uy:8080/geoserver/wms?WIDTH=256&SRS=EPSG%3A32721&LAYERS=imm%3Av_uptu_horarios_control&HEIGHT=256&STYLES=&
 * FORMAT=image%2Fpng&TRANSPARENT=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&CQL_FILTER=%20cod_variante%20%3D%207578%20AND%20
 * frecuencia%20%3D%201050%20AND%20tipo_dia%20%3D%201&BBOX=570961.96875,6148460.96875,571464,6148963
 * 
 * http://geoserver.imm.gub.uy:8080/geoserver/imm/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&
 * LAYERS=imm%3Av_uptu_horarios_control&STYLES&CQL_FILTER=cod_variante%3D3267&
 * SRS=EPSG%3A32721&WIDTH=524&HEIGHT=331&BBOX=553073.1359891298%2C6133709.833217847%2C593081.3015108702%2C6158982.166782153
 * 
 * 
 */


/**
 * Levanta la poligonal que conforma una variante, lo pinto como un
 * LineString en el mapa Esto es de ejemplo pero puede que sea útil para
 * alguna función X
 * 
 * @param codigo
 * @returns
 */
function cargarRecorridoVariante(codigo) {
	// console.log(codigo);
	var lineastyle = [];
	lineastyle = [
		new ol.style.Style({
			stroke: new ol.style.Stroke({
				color: '#907ca4',
				width: 6,
			})
		})
	];
	sourceCollection = new ol.source.Vector({
		format: new ol.format.GeoJSON(),
		url: geoserver.CAPA_VARIANTE_HABILITADAS
	});
	testLayer = new ol.layer.Vector({
		source: sourceCollection,
		style: lineastyle
	});
	map.addLayer(testLayer);
}

function addOrigenDestinoVariante(x, y, id, txt) {
	var point = new ol.Feature({
		geometry: new ol.geom.Point([x, y]),
		txt: txt
	});
	var style;
	var img;
	if (id == '-1') {
		img = dir.ICON_ORIGEN;
		style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					scale: 2,
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img
				}))
			}),
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 0.5,
					fill: new ol.style.Fill({ color: 'black' }),
					stroke: new ol.style.Stroke({
						color: [0, 0, 0], width: 1
					})
				})
			})
		];
	}
	else if (id == '0') {
		txt = txt.replace('key', '"key"');
		txt = txt.replace('value', '"value"');
		txt = txt.replace('hide', '"hide"');
		point = new ol.Feature({
			geometry: new ol.geom.Point([x, y]),
			txt: txt
		});
		img = dir.ICON_CONTROL;
		style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					scale: 1,
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img
				}))
			}),
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 0.5,
					fill: new ol.style.Fill({ color: 'blue' }),
					stroke: new ol.style.Stroke({
						color: [0, 0, 0], width: 1
					})
				})
			})
		];
	}
	else if (id == '1') {
		img = dir.ICON_DESTINO;
		style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					scale: 2,
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img
				}))
			}),
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 0.5,
					fill: new ol.style.Fill({ color: 'black' }),
					stroke: new ol.style.Stroke({
						color: [0, 0, 0], width: 1
					})
				})
			})
		];
	} else if (id == '2') {
		img = dir.ICON_INTERCAMBIO;
		style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					scale: 1,
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img
				}))
			}),
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 0.5,
					fill: new ol.style.Fill({ color: 'blue' }),
					stroke: new ol.style.Stroke({
						color: [0, 0, 0], width: 1
					})
				})
			})
		];
	}
	point.setStyle(style);
	if (id == '0') {
		vectorPControl.push(point);
	} else {
		vectorPControlOrigenDestino.push(point);
	}
	// viajesVector.push(point);
}

function zoomFour(x1, y1, x2, y2, tipo) {
	if (map === undefined) {
		setTimeout(() => {
			zoomFour(x1, y1, x2, y2, tipo);
		}, 500);
	}
	else {
		var xMinlo = x1;
		var yMinla = y1;
		var xMaxlo = x2;
		var yMaxla = y2;
		var newProj = new ol.proj.Projection({
			code: 'EPSG:32721',
			extent: [286681, 5892788, 873206, 6505879],
			units: 'm'
		});
		var fromLonLat = ol.proj.getTransform('EPSG:3857', newProj);
		var extent = ol.extent.applyTransform(
			[xMinlo, yMinla, xMaxlo, yMaxla], fromLonLat);
		zAnterior = extent;
		newProj.setExtent(extent);
		var newView = new ol.View({
			projection: newProj
		});
		var size = map.getSize();
		if (size) {
			map.getView().fit(extent, size);
		}
	}
}

var colors = ['#4374d7', '#907ca4', 'red', 'orange', 'yellow', 'green', 'cyan', 'azure', 'brown',
	'blue', 'violet', 'magenta', 'pink', 'chartreuse', 'salmon', 'gray', 'black'];

var arrows = [
	'red.png', 'orange.png', 'yellow.png', 'green.png', 'cyan.png', 'azure.png', 'brown.png', 'blue.png', 'violet.png',
	'magenta.png', 'pink.png', 'chartreuse.png', 'salmon.png', 'gray.png'
];





function addMarker(x, y, txt, id, id_path = 2, tipo) {
	txt = txt.replace('key', '"key"');
	txt = txt.replace('value', '"value"');
	var point1 = new ol.Feature({
		geometry: new ol.geom.Point([x, y]),
		txt: txt
	});
	var img;
	var style;
	if (id === '0') {
		img = dir.ICON_PARADA;
		style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img,
					scale: 0.80
				}))
			}),
			new ol.style.Style({
			image: new ol.style.Circle({
					radius: 1,
					fill: new ol.style.Fill({ color: colors[id_path] }),
					stroke: new ol.style.Stroke({
						color: [0, 0, 0], width: 1
					})
				})
			})
		];
	}
	else if (id === '-1') {
		img = dir.ICON_ORIGEN;
		style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					scale: 2,
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img
				}))
			}),
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 0.5,
					fill: new ol.style.Fill({ color: colors[id_path] }),
					stroke: new ol.style.Stroke({
						color: [0, 0, 0], width: 1
					})
				})
			})
		];
	}
	else if (id === '1') {
		img = dir.ICON_DESTINO;
		style = [
			new ol.style.Style({
				image: new ol.style.Icon(({
					scale: 2,
					rotateWithView: true,
					rotation: 360 * Math.PI / 180,
					anchor: [0.5, 1],
					anchorXUnits: 'fraction',
					anchorYUnits: 'fraction',
					opacity: 0.95,
					src: img
				}))
			}),
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 0.5,
					fill: new ol.style.Fill({ color: colors[id_path] }),
					stroke: new ol.style.Stroke({
						color: [0, 0, 0], width: 1
					})
				})
			})
		];
	}
	else if (id === '2') {
		style = [
			new ol.style.Style({
				image: new ol.style.Circle({
					radius: 5,
					fill: new ol.style.Fill({ color: colors[6] }),
					stroke: new ol.style.Stroke({
						color: 'white',
						width: 2
					})
				})
			})
		];
	}
	point1.setStyle(style);
	if (tipo === 'odf') {
		viajesVector.push(point1);
	} else {
		paradaVarianteVector.push(point1);
	}

}

function addEvento(x, y, txt, tipo, color, radio) {
	console.log('color', color + " radio: " + radio);
	var point1 = new ol.Feature({
		geometry: new ol.geom.Point([x, y]),
	});
	var img;
	var style;
	// Seleccionar el icono.
	switch (tipo) {
		case 'PUNTO':
			// console.log('Sin el icono. ');
			break;
		case 'ORIGEN':
			img = dir.ICON_ORIGEN;
			// console.log('Seleccionar el icono:' + img);
			break;
		case 'DESTINO':
			img = dir.ICON_DESTINO;
			// console.log('Seleccionar el icono:' + img);
			break;
		case 'PARADA':
			img = dir.ICON_PARADA;
			// console.log('Seleccionar el icono:' + img);
			break;
		case 'MARCADOR':
			img = dir.ICON_MARCADOR;
			// console.log('Seleccionar el icono:' + img);
			break;
	}
	switch (tipo) {
		case 'PUNTO':
		case 'MARCADOR':
			style = [
				new ol.style.Style({
					image: new ol.style.Circle({
						radius: radio,
						fill: new ol.style.Fill({ color: colors[color] }),
						stroke: new ol.style.Stroke({
							color: 'white',
							width: 2
						})
					})
				})
			];
			break;
		case 'PARADA':
		case 'ORIGEN':
		case 'DESTINO':
		case 'CONTROL':
			txt = txt.replace('key', '"key"');
			txt = txt.replace('value', '"value"');
			point1 = new ol.Feature({
				geometry: new ol.geom.Point([x, y]),
				txt: txt
			});
			style = [
				new ol.style.Style({
					image: new ol.style.Icon(({
						scale: 2,
						rotateWithView: true,
						rotation: 360 * Math.PI / 180,
						anchor: [0.5, 1],
						anchorXUnits: 'fraction',
						anchorYUnits: 'fraction',
						opacity: 0.95,
						src: img
					}))
				}),
				new ol.style.Style({
					image: new ol.style.Circle({
						radius: 0.5,
						fill: new ol.style.Fill({ color: colors[color] }),
						stroke: new ol.style.Stroke({
							color: [0, 0, 0], width: 1
						})
					})
				})
			];
			break;
	}
	point1.setStyle(style);
	// ver el tema de odf
	paradaVarianteVector.push(point1);
}


function LineString(lonlat, location2, color, tipoviaje, id) {
	var lineastyle = [];
	var linea = new ol.Feature({
		geometry: new ol.geom.LineString([lonlat, location2]),
		name: 'Line',
	});
	if (tipoviaje == '0') {
		lineastyle = [
			new ol.style.Style({
				stroke: new ol.style.Stroke({
					color: colors[color],// '#907ca4',
					width: 6,
				})
			})
		];
	} else {
		lineastyle = [
			new ol.style.Style({
				stroke: new ol.style.Stroke({
					color: colors[color],// '#4374d7',
					lineDash: [10, 10],
					width: 3,
				})
			})
		];
		var dx = location2[0] - lonlat[0];
		var dy = location2[1] - lonlat[1];
		var rotation = Math.atan2(dy, dx);
		var ic = dir.ICON_FECHA;
		lineastyle.push(new ol.style.Style({
			geometry: new ol.geom.Point(location2),
			image: new ol.style.Icon({
				src: ic,
				scale: 1,
				anchor: [0.75, 0.5],
				rotateWithView: true,
				rotation: -rotation
			})
		}));
	}
	linea.setStyle(lineastyle);
	if (tipoviaje == '0') {
		varianteLineas.push(linea);
	} else {
		var arr = new Array();
		var found = false;
		for (var i = 0; i < lineas.length; i++) {
			if (lineas[i].key == id) {
				arr = lineas[i].value;
				arr.push(linea);
				lineas[i].value = arr;
				found = true;
				break;
			}
		}
		if (found == false) {
			arr.push(linea);
			lineas.push({ key: id, value: arr });
		}
	}
}

function guardarLinea(lonlat, location2, color, tipoviaje, id) {
	var tupla = {
		x: lonlat,
		y: location2,
		c: color,
		t: tipoviaje,
		key: id
	};
	if (color == 2) {
		salvaLineasCombinacion.push(tupla);
	} else {
		salvaLineas.push(tupla);
	}
}

function Poligono(coordenadas, color, separacion) {
	if (map === undefined) {
		setTimeout(() => {
			Poligono(coordenadas, color, separacion);
		}, 2000);
	} else {
		var poligonoCoord = [];
		var temp = coordenadas;
		var coords = temp.split('/');
		for (var i in coords) {
			var c = coords[i].split('*');
			var transformadas = btnToUTM_OnClick(c[0], c[1]);
			var lo = transformadas[0];
			var la = transformadas[1];
			poligonoCoord.push([lo, la]);
		}
		var feature = new ol.Feature({
			geometry: new ol.geom.Polygon([poligonoCoord])
		})
		var lineastyle = [
			new ol.style.Style({
				stroke: new ol.style.Stroke({
					color: colors[color],
					lineDash: [10, 10],
					width: 3,
				}),
				fill: new ol.style.Fill({
					color: 'rgba(0, 0, 255, 0.1)'
				})
			})
		];
		feature.setStyle(lineastyle);
		var vectorPoligono = new ol.layer.Vector({
			source: new ol.source.Vector({
				features: [feature]
			}),
			visible: true
		});
		map.addLayer(vectorPoligono);
	}
}

// Prender o apagadar capas
function setFeatureVectorOrigenDestino(visiblity) {
	if (map === undefined) {
		setTimeout(() => {
			setFeatureVectorOrigenDestino(visiblity);
		}, 500);
	} else {
		var vectorSource = new ol.source.Vector({
			features: vectorPControlOrigenDestino
		});
		layerPControlOrigenDestino = new ol.layer.Vector({
			source: vectorSource,
			visible: visiblity,
			zIndex: 11// 3
		});
		map.addLayer(layerPControlOrigenDestino);
	}
}
// Prender o apagadar capas
function setFeatureVectorPuntoControl(visiblity) {
	if (map === undefined) {
		setTimeout(() => {
			setFeatureVectorPuntoControl(visiblity);
		}, 500);
	} else {
		var vectorSource = new ol.source.Vector({
			features: vectorPControl
		});
		layerPControl = new ol.layer.Vector({
			source: vectorSource,
			visible: visiblity,
			zIndex: 12// 4
		});
		map.addLayer(layerPControl);
	}
}
// Prender o apagadar capas
function setFeatureVectorViajes(visiblity) {
	if (map === undefined) {
		setTimeout(() => {
			setFeatureVectorViajes(visiblity);
		}, 500);
	} else {
		map.removeLayer(vectorLayer);
		var vectorSource = new ol.source.Vector({
			features: viajesVector
		});
		vectorLayer = new ol.layer.Vector({
			source: vectorSource,
			visible: visiblity,
			zIndex: 2
		});
		map.addLayer(vectorLayer);
	}
}
// Prender o apagadar capas
function setFeatureVectorParadasVariante(visibility) {
	if (map === undefined) {
		setTimeout(() => {
			setFeatureVectorParadasVariante(visibility);
		}, 500);
	} else {
		map.removeLayer(paradaVarianteLayer);
		var vectorSource = new ol.source.Vector({
			features: paradaVarianteVector
		});
		paradaVarianteLayer = new ol.layer.Vector({
			source: vectorSource,
			visible: visibility,
			zIndex: 1
		});
		map.addLayer(paradaVarianteLayer);
	}
}
// Prender o apagadar capas
function setFeatureLineasViaje(visiblity) {
	if (map === undefined) {
		setTimeout(() => {
			setFeatureLineasViaje(visiblity);
		}, 500);
	} else {
		var vectorSource = new ol.source.Vector({
			features: varianteLineas
		});
		vectorLineaViaje = new ol.layer.Vector({
			source: vectorSource,
			visible: visiblity,
			zIndex: 10
		});
		vectorLineaViaje.setVisible(true);
		map.addLayer(vectorLineaViaje);
	}
}
// Prender o apagadar capas
function visibilidadFeatureLineaSelected(id, lista) {
	lineas = new Array();
	if (lista == '0') {
		map.removeLayer(estaLayer);
		salvaLineas.forEach(function(tupla) {
			if (tupla.hasOwnProperty('key') && compare(id, tupla['key'])) {
				LineString(tupla['x'], tupla['y'], tupla['c'], tupla['t'], tupla['key']);
			}
		});
	} else {
		map.removeLayer(combinacionLayer);
		salvaLineasCombinacion.forEach(function(tupla) {
			if (tupla.hasOwnProperty('key') && compare(id, tupla['key'])) {
				LineString(tupla['x'], tupla['y'], tupla['c'], tupla['t'], tupla['key']);
			}
		});
	}
	var pintar = new Array();
	for (var i = 0; i < lineas.length; i++) {
		var temp = lineas[i].value;
		for (var j = 0; j < temp.length; j++) {
			pintar.push(temp[j]);
		}
	}
	if (lista == '0') {
		esteSource = new ol.source.Vector({
			features: pintar
		});
		estaLayer = new ol.layer.Vector({
			source: esteSource,
			visible: true,
			name: 'Lineas',
			zIndex: 10
		});
		map.addLayer(estaLayer);
	} else {
		combinacionSource = new ol.source.Vector({
			features: pintar
		});
		combinacionLayer = new ol.layer.Vector({
			source: combinacionSource,
			visible: true,
			name: 'Lineas',
			zIndex: 10
		});
		map.addLayer(combinacionLayer);
	}
}
// Utils
function compare(codigos, key) {
	if (codigos.length > 0) {
		var cod = codigos.split(',');
		for (var i = 0; i < cod.length; i++) {
			if (cod[i] == key) {
				return true;
			}
		}
	}
	return false;
}
// Prender o apagadar capas
function setFeatureVectorOcio() {
	var vectorSource = new ol.source.Vector({
		features: ocioVector
	});
	vectorOcioLayer = new ol.layer.Vector({
		source: vectorSource,
		visible: false,
	});
	map.addLayer(vectorOcioLayer)
}
// Prender o apagadar capas
function setFeatureLineasVectorOcio() {
	var vectorSource = new ol.source.Vector({
		features: featuresLineaOciosas
	});
	vectorLineaOcio = new ol.layer.Vector({
		source: vectorSource,
		visible: false,
	});
	map.addLayer(vectorLineaOcio);
}

/**
 * Sección nueva del PDF
 * https://openlayers.org/en/v5.3.0/examples/export-pdf.html?q=pdf
 * 
 */

var dims = {
	a0: [1189, 841],
	a1: [841, 594],
	a2: [594, 420],
	a3: [420, 297],
	a4: [297, 210],
	a5: [210, 148],
};
var exportButton = document.getElementById('export-pdf');
if (exportButton !== null) {
	exportButton.addEventListener('click', function() {
		exportButton.disabled = true;
		document.body.style.cursor = 'progress';
		var format = "a4";
		var resolution = "72";
		var dim = dims[format];
		var width = Math.round(dim[0] * resolution / 25.4);
		var height = Math.round(dim[1] * resolution / 25.4);
		var size = (map.getSize());
		var extent = map.getView().calculateExtent(size);
		map.once('rendercomplete', function(event) {
			var canvas = event.context.canvas;
			var data = canvas.toDataURL('image/jpeg');
			var pdf = new jsPDF('landscape', undefined, format);
			pdf.addImage(data, 'JPEG', 0, 0, dim[0], dim[1]);
			pdf.save('Lineas_Montevideo.pdf');
			// Reset original map size
			map.setSize(size);
			map.getView().fit(extent, { size: size });
			exportButton.disabled = false;
			document.body.style.cursor = 'auto';
		});
		// Set print size
		var printSize = [width, height];
		map.setSize(printSize);
		map.getView().fit(extent, { size: printSize });
		window.event.preventDefault();
	}, false);
}

function addControl() {
	var fullSceen = new ol.control.FullScreen({ tipLabel: "Pantalla Completa" });
	map.addControl(fullSceen);
	// map.addControl(this.exportarPdf);
}
/**
* Botón para realizar la función de exportar el mapa
*/
var button = document.createElement('button');
// button.textContent = "⤢";
button.title = "Pantalla completa";
button.classList.add("pantallaCompleta");
var fullScreem = false;
var handlerExportar = function(e) {
	const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
	if (fullScreem) {
		fullScreem = !fullScreem;
		if (width < 640) {
			$('div.sinPaddingMobile.col-xs-12.col-lg-8').removeClass('zoomMobile');
		} else {
			$('div.sinPaddingMobile.col-xs-12.col-lg-8').removeClass('zoom');
		}
	} else {
		fullScreem = !fullScreem;
		if (width < 640) {
			$('div.sinPaddingMobile.col-xs-12.col-lg-8').addClass('zoomMobile');
		} else {
			$('div.sinPaddingMobile.col-xs-12.col-lg-8').addClass('zoom');
		}
	}
	map.updateSize();
	document.body.scrollTop = 0;
	document.documentElement.scrollTop = 0;
	e.preventDefault();
};
button.addEventListener('click', handlerExportar, false);
var element = document.createElement('div');
// element.className = 'rotate-north ol-unselectable ol-control
// ol-full-screen';
element.className = 'rotate-north ol-unselectable ol-control';
element.appendChild(button);
var exportarPdf = new ol.control.Control({
	element: element
});



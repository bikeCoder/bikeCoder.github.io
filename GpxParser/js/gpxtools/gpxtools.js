/*global DOMParser, ActiveXObject */
/*global func */
/*global console, window */
/*global GLatLng, GLatLngBounds, GPolyline, GEvent, GMarker */

function GPXParser(map)
{
	this.xmlDoc = null;
	this.map = map;
	this.map.enableScrollWheelZoom();
	this.trackcolor = "#ff00ff"; // red
	this.segmentcolorprovider = function (pnt1, pnt2) {
		return this.trackcolor;
	};
	this.trackwidth = 5;
	this.routecolor = '#ff00ff';
	this.routewidth = 3;
	//最小轨迹点差量
	this.mintrackpointdelta = 0.0; // in km
	//最大轨迹点差量
	this.maxtrackpointdelta = 30.0; // in km
	this.markers = [];

	/*
	// augment the v3 api: http://stackoverflow.com/questions/1544739/google-maps-api-v3-how-to-remove-all-markers/1903905#1903905
	if (google.maps.Map.prototype.clearMarkers == undefined) {
		google.maps.Map.prototype.clearMarkers = function () {
			for(var i=0; i < google.maps.Map.prototype.markers.length; i++){
				google.maps.Map.prototype.markers[i].setMap(null);
				delete google.maps.Map.prototype.markers[i];
			}
			google.maps.Map.prototype.markers = [];
		};
	}
	*/
}

// 设置轨迹线条颜色
GPXParser.prototype.SetTrackcolor = function (color)
{
	this.trackcolor = color;
};

// 设置轨迹线条颜色
GPXParser.prototype.SetSegmentColorProvider = function (colorProvider)
{
	this.segmentcolorprovider = colorProvider;
};

// 设置轨迹线条宽度
GPXParser.prototype.SetTrackWidth = function (width)
{
	this.trackwidth = width;
};

// 设置轨迹点之间的最小距离
// 从地图剔除不必要的轨迹点
GPXParser.prototype.SetMinTrackPointDelta = function (delta)
{
	this.mintrackpointdelta = delta;
};

// 设置轨迹点之间的最大距离
// 用于剔除GPX Bug
GPXParser.prototype.SetMaxTrackPointDelta = function (delta)
{
	this.maxtrackpointdelta = delta;
};

GPXParser.prototype.TranslateName = function (name)
{
	if (name === "wpt")
	{
		return "Waypoint";
	}
	else if (name === "trkpt")
	{
		return "Track Point";
	}
	return name;
};

//文本转xml
GPXParser.prototype.textToXml = function (text) {
	var xmlDoc, parser;
	
	if (window.DOMParser) {
		parser = new DOMParser();
		xmlDoc = parser.parseFromString(text, "text/xml");
	}
	else // Internet Explorer
	{
		xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
		xmlDoc.async = "false";
		xmlDoc.loadXML(text);
	}
	return xmlDoc;
};

// ---------------------- PARSING ----------------------------------

// 解析GPX内部结构
GPXParser.prototype.ParseGpx = function (xmlstring)
{
	var xmlDoc, data, tracks, waypoints, routes, gpxParser;
	
	gpxParser = this;
	
	xmlDoc = this.textToXml(xmlstring);

	data = {
		tracks: Functional.reduce(
			function (list, track) {
				return list.push(gpxParser.parseTrack(track));
			},
			[],
			xmlDoc.documentElement.getElementsByTagName("trk")),
		waypoints: [],
		routes: []
		};
	
	/*
	tracks = xmlDoc.documentElement.getElementsByTagName("trk");
	for (var i = 0; i < tracks.length; i++)
	{
		data.tracks.push(this.parseTrack(tracks[i]));
	}
	*/
	//获取路点
	waypoints = xmlDoc.documentElement.getElementsByTagName("wpt");
	for (var i = 0; i < waypoints.length; i++)
	{
		data.waypoints.push(this.parseWaypoint(waypoints[i]));
	}

	//获取路线
	routes = xmlDoc.documentElement.getElementsByTagName("rte");
	for (var i = 0; i < routes.length; i++)
	{
		data.routes.push(this.parseRoute(routes[i]));
	}

	return data;
};

//解析轨迹
GPXParser.prototype.parseTrack = function (trackxml) {
	var track = {
		segments: [],
		length: 0
	};

	//获取轨迹片段
	var segments = trackxml.getElementsByTagName("trkseg");
	for (var i = 0; i < segments.length; i++)
	{
		var segment = this.parseSegment(segments[i]);
		track.segments.push(segment);
		track.length += segment.length;
	}

	return track;
};

//解析轨迹片段
GPXParser.prototype.parseSegment = function (segmentxml) {
	var segment = { 
		points: [],
		length: 0
	};

	//获取轨迹点
	var trackpoints = segmentxml.getElementsByTagName("trkpt");
	
	//如果轨迹点数量为0则直接返回
	if (trackpoints.length == 0)
	{
		return segment;
	}

	// 获取第一个轨迹点
	var lastpnt = this.parseTrackPoint(trackpoints[0]);
	segment.points.push(lastpnt);

	for (var i=1; i < trackpoints.length; i++)
	{
		var pnt = this.parseTrackPoint(trackpoints[i], lastpnt);


		var dist = this._pntDistance(lastpnt, pnt);
		
		//判断最大轨迹点差量是否大于0并且轨迹点距离是否大于最大轨迹点差量
		if (this.maxtrackpointdelta > 0 &&
			dist > this.maxtrackpointdelta) {
			// alert(dist);
			console.debug('错误的轨迹点: lat=' + pnt.lan + ', lon=' + pnt.lon + ' (距离 = ' + dist + ' km)');
			continue;
		}
		segment.points.push(pnt);
		segment.length += dist;
		lastpnt = pnt;
	}

	return segment;
};

//解析路线
GPXParser.prototype.parseRoute = function (routexml) {
	var route = {
		points: []
	};

	var routepoints = routexml.getElementsByTagName("rtept");

	for (var i=0; i < routepoints.length; i++)
	{
		route.points.push(this.parseRoutePoint(routepoints[i]));
	}

	return route;
};

//解析路线点
GPXParser.prototype.parseRoutePoint = function (routepoint) {
	var pnt = {
		lat: 0,
		lon: 0,
		latLng: null,
		name: '',
		comment: '',
		html: ''
	};

	//解析字符串返回浮点数
	pnt.lat = parseFloat(routepoint.getAttribute('lat'));
	pnt.lon = parseFloat(routepoint.getAttribute('lon'));
	
	pnt.latlng = new GLatLng(pnt.lat,pnt.lon);
	
	//获取路线名
	var names = routepoint.getElementsByTagName("name");
	if (names[0] !== undefined) {
		pnt.name = names[0].textContent;
		pnt.html = '<b>' + pnt.name + '</b>';
	}
	
	var cmts = routepoint.getElementsByTagName("cmt");
	if (cmts[0] !== undefined) {
		pnt.comment = cmts[0].textContent; 
		pnt.html += '<br />' + pnt.comment;
	}

	return pnt;
};

//解析路点
GPXParser.prototype.parseWaypoint = function (xmlwaypoint) {
	var waypoint = {
		lon: parseFloat(xmlwaypoint.getAttribute("lon")),
		lat: parseFloat(xmlwaypoint.getAttribute("lat")),
		html: ''
	};

	if (xmlwaypoint.getElementsByTagName("html").length > 0)
	{
		for (var i = 0; i<xmlwaypoint.getElementsByTagName("html").item(0).childNodes.length; i++)
		{
			waypoint.html += xmlwaypoint.getElementsByTagName("html").item(0).childNodes[i].nodeValue;
		}
	}
	else
	{
		// Create the html if it does not exist in the point.
		waypoint.html = "<b>" + this.TranslateName(xmlwaypoint.nodeName) + "</b><br>";
		var attributes = xmlwaypoint.attributes;
		var attrlen = attributes.length;
		for (var i = 0; i < attrlen; i++)
		{
			waypoint.html += attributes.item(i).name + " = " + attributes.item(i).nodeValue + "<br>";
		}

		if (xmlwaypoint.hasChildNodes)
		{
			var children = xmlwaypoint.childNodes;
			var childrenlen = children.length;
			for (i=0; i<childrenlen; i++)
			{
				// 忽略空节点
				if (children[i].nodeType != 1) { continue; }
				if (children[i].firstChild == null) { continue; }
				waypoint.html += children[i].nodeName + " = " + children[i].firstChild.nodeValue + "<br>";
			}
		}
	}

	return waypoint;
};


// ---------------------- 绘制 ----------------------------------

//绘制GPX
GPXParser.prototype.DrawGpx = function (gpxdata, maptype, drawTracks, drawWaypoints, drawRoutes) {
	if (maptype == null) {
		maptype = this.map.getCurrentMapType();
	}

	if (drawTracks == null) {
		drawTracks = true;
	}

	if (drawWaypoints == null) {
		drawWaypoints = true;
	}

	if (drawRoutes == null) {
		drawRoutes = true;
	}

	this._clearMarkers();

	this._centerAndZoom(gpxdata, maptype);

	if (drawTracks)
		func.map(gpxdata.tracks, this, this._drawTrack, this.segmentcolorprovider, this.trackwidth);

	if (drawWaypoints)
		func.map(gpxdata.waypoints, this, this._drawWaypoint);

	if (drawRoutes)
		func.map(gpxdata.routes, this, this._drawRoute, this.routecolor, this.routewidth);
};

//绘制轨迹
GPXParser.prototype._drawTrack = function (track, segmentcolorprovider, trackwidth) {
	func.map(track.segments, this, this._drawSegment, segmentcolorprovider, trackwidth);
};

//绘制轨迹片段
GPXParser.prototype._drawSegment = function (segment, segmentcolorprovider, trackwidth) {
	if (segment.points.length == 0)
		return;

	var lastpnt = segment.points[0];

	for (var i=1; i < segment.points.length; i++)
	{
		var pnt = segment.points[i];
		var linesegment = [lastpnt.latlng, pnt.latlng];

		// 确定轨迹点距离大于最小轨迹点距离并绘制它
		if (this._pntDistance(lastpnt, pnt) > this.mintrackpointdelta)
		{
			var color = segmentcolorprovider(lastpnt, pnt);
			var polyline = new GPolyline(linesegment, color, trackwidth);
			this._addOverlay(polyline);
		}

		lastpnt = pnt;
	}
};

//绘制路线
GPXParser.prototype._drawRoute = function (route, color, trackwidth) {
	if (route.points.length == 0)
		return;

	var lastpnt = route.points[0];
	this._drawWaypoint(lastpnt);

	for (var i=1; i < route.points.length; i++)
	{
		var pnt = route.points[i];
		var linesegment = [lastpnt.latlng, pnt.latlng];

		var polyline = new GPolyline(linesegment, color, trackwidth);
		this._addOverlay(polyline);
		
		this._drawWaypoint(pnt);

		lastpnt = pnt;
	}
};

//绘制路点
GPXParser.prototype._drawWaypoint = function (waypoint) {
	var marker = new GMarker(new GLatLng(waypoint.lat,waypoint.lon));
	GEvent.addListener(marker, "click", function () {
		//在标记图示之上打开地图信息窗口
		marker.openInfoWindowHtml(waypoint.html);
	});

	this._addOverlay(marker);
};

// ---------------------- 工具 ----------------------------------


GPXParser.prototype._degToRad = function (deg) {
	return deg * Math.PI / 180;
};

// thanks: http://www.movable-type.co.uk/scripts/latlong.html
//计算轨迹点距离
GPXParser.prototype._pntDistance = function (pnt1, pnt2) {

	var lat1 = pnt1.lat;
	var lon1 = pnt1.lon;
	var lat2 = pnt2.lat;
	var lon2 = pnt2.lon;

	var R = 6371; // km
	var dLat = this._degToRad(lat2-lat1);
	var dLon = this._degToRad(lon2-lon1);
	var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
			Math.cos(this._degToRad(lat1)) * Math.cos(this._degToRad(lat2)) *
			Math.sin(dLon/2) * Math.sin(dLon/2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	var d = R * c;

	return d; // km
};

//解析估计点
GPXParser.prototype.parseTrackPoint = function (trackpoint, lastpnt) {
	var pnt = {};

	pnt.lat = parseFloat(trackpoint.getAttribute('lat'));
	pnt.lon = parseFloat(trackpoint.getAttribute('lon'));
	pnt.latlng = new GLatLng(pnt.lat,pnt.lon);

	var elmsElevation = trackpoint.getElementsByTagName('ele');
	if (elmsElevation.length > 0) {
		pnt.ele = parseFloat(elmsElevation[0].textContent);
	}

	var elmsTime = trackpoint.getElementsByTagName('time');
	if (elmsTime.length > 0) {
		pnt.time = Date.parse(elmsTime[0].textContent);
	}

	if (lastpnt != null) {
		pnt.timediff = pnt.time - lastpnt.time;
		pnt.dst = this._pntDistance(lastpnt, pnt);
		pnt.spd = pnt.dst / pnt.timediff * 1000 * 60 * 60;
		if (pnt.ele != undefined && lastpnt.ele != undefined)
			pnt.elediff = pnt.ele - lastpnt.ele;
	}

	return pnt;
};

GPXParser.prototype._centerAndZoom = function (gpxdata, maptype)
{
	var minlat = 0;
	var maxlat = 0;
	var minlon = 0;
	var maxlon = 0;

	var updateBounds = function (pnt) {
		// If the min and max are uninitialized then initialize them.
		if ((minlat == maxlat) && (minlat == 0))
		{
			minlat = pnt.lat;
			maxlat = pnt.lat;
			minlon = pnt.lon;
			maxlon = pnt.lon;
		}
		if (pnt.lon < minlon) minlon = pnt.lon;
		if (pnt.lon > maxlon) maxlon = pnt.lon;
		if (pnt.lat < minlat) minlat = pnt.lat;
		if (pnt.lat > maxlat) maxlat = pnt.lat;
	}

	func.map(gpxdata.waypoints, this, updateBounds);

	func.map(gpxdata.tracks, this, function (track) {
		func.map(track.segments, this, function (segment) {
			func.map(segment.points, this, updateBounds);
		});
	});

	func.map(gpxdata.routes, this, function (route) {
		func.map(route.points, this, updateBounds);
	});


	if ((minlat == maxlat) && (minlat == 0))
	{
		this.map.setCenter(new GLatLng(49.327667, -122.942333), 14);
		return;
	}

	// Center around the middle of the points
	var centerlon = (maxlon + minlon) / 2;
	var centerlat = (maxlat + minlat) / 2;

	var bounds = new GLatLngBounds(new GLatLng(minlat, minlon), new GLatLng(maxlat, maxlon));

	this.map.setCenter(new GLatLng(centerlat, centerlon), this.map.getBoundsZoomLevel(bounds), maptype);
};

GPXParser.prototype._addOverlay = function (marker)
{
	this.markers.push(marker);
	this.map.addOverlay(marker);
}

GPXParser.prototype._clearMarkers = function ()
{
	for(var i=0; i < this.markers.length; i++){
		if (this.markers[i].setMap != undefined)
			this.markers[i].setMap(null);

		if (this.markers[i].remove != undefined)
			this.markers[i].remove();
	}
	this.markers.length = 0;
}


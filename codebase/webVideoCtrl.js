/*****************************************************
 FileName: WebVideoCtrl.js
 Description: 插件类
 Date: 2013.11.27
 *****************************************************/

(function (window) {
    if(window.WebVideoCtrl) {
        return;
    }

    var WebVideoCtrl = (function () {
        /************************WebVideoCtrl 成员变量声明start***************************/
        //初始化必选参数
        var m_szWidth = "100%";
        var m_szHeight = "100%";
        var m_szPluginID = "";
        var m_szPluginName = "";

        //可选参数
        var m_options = {
            szContainerID: "",		//插件的容器ID，如果设置了这个，初始化完成后会自动插入插件（暂定）
            szColorProperty: "",	//插件的颜色，传入控件，控件中有默认值，如WEB3.0基线
            szOcxClassId: "clsid:FDF0038A-CF64-4634-81AB-80F0A7946D6C", //IE插件的ocxID，默认为改名后的
            szMimeTypes: "application/webvideo-plugin-kit",              //非IE的mimetypes, 默认为改名后的
            iWndowType: 1,			//分屏类型，分屏个数
            iPlayMode: 2,			//播放模式
            bWndFull: true,         //双击单窗口全屏，默认开启
            bDebugMode: false,		//debug模式，开启debug模式后，会在浏览器控制台中进行打印
            cbSelWnd: null,			//窗口选择回调
            cbEvent: null			//各类事件回调
        };

        //成员变量
        var m_pluginOBJECT = null;  //web3.0 控件对象
        var m_iSelWnd = 0;          //当前选中窗口号，默认为0
        var m_deviceSet = [];  //插件维护的设备列表
        var m_wndSet = [];  //窗口列表
        var m_httpRequest = [];  //http请求列表，http返回后，通过这个列表调用回调函数

        //各个对象的声明
        //声明在最前，实现放在中间，实例化放在代码末尾，否则会导致实例化失败
        var m_systemInstance = null; //系统类实例
        var m_ISAPIProtocol = null; //ISAPI协议实例声明
        var m_PSIAProtocol = null;  //PSIA协议实例声明
        var m_utilsInc = null;  //工具模块实例

        //生成的webVideoCrl对象
        var m_webVideoCtrl = this;
        var m_xmlLocalCfg = null;

        //宏定义
        var PROTOCOL_DEVICE_ISAPI = 1;
        var PROTOCOL_DEVICE_PSIA = 2;

        //HTTP请求状态
        var HTTP_STATUS_OK_200 = 200;
        var HTTP_STATUS_ERROR_403 = 403;

        //播放状态
        var PLAY_STATUS_STOP = 0;
        var PLAY_STATUS_REALPLAY = 1;
        var PLAY_STATUS_PLAYBACK = 2;
        var PLAY_STATUS_PAUSE = 3;
        var PLAY_STATUS_FRAME = 4;
        var PLAY_STATUS_REVERSE_PLAYBACK = 5;
        var PLAY_STATUS_REVERSE_PAUSE = 6;

        //插件事件
        var PLUGIN_EVENTTYPE_PLAYABNORMAL = 0;  //回放异常
        var PLUGIN_EVENTTYPE_PLAYBACKSTOP = 2;	//回放停止
        var PLUGIN_EVENTTYPE_AUDIOTALKFAIL = 3;	//语音对讲失败
        var PLUGIN_EVENTTYPE_NOFREESPACE = 21;	//录像过程中，硬盘容量不足

        //播放协议类型
        var PROTOCOLTYPE_PLAY_TCP = 0;
        var PROTOCOLTYPE_PLAY_UDP = 1;

        //设备类型
        var DEVICE_TYPE_IPCAMERA = "IPCamera";  //IPC
        var DEVICE_TYPE_IPDOME = "IPDome";  //球机
        var DEVICE_TYPE_IPZOOM = "IPZoom";  //球机机芯

        var m_szVersion = "<?xml version='1.0' encoding='utf-8'?><FileVersion>" +
            "<Platform name='win32'>" +
            "<npWebVideoKitPlugin.dll>3,0,6,1</npWebVideoKitPlugin.dll>" +
            "<WebVideoKitActiveX.ocx>3,0,6,1</WebVideoKitActiveX.ocx>" +
            "<PlayCtrl.dll>7,3,0,81</PlayCtrl.dll>" +
            "<StreamTransClient.dll>1,1,3,5</StreamTransClient.dll>" +
            "<SystemTransform.dll>2,5,1,7</SystemTransform.dll>" +
            "<NetStream.dll>1,0,5,59</NetStream.dll>" +
            "</Platform>" +
            "</FileVersion>";

        /************************WebVideoCtrl 成员变量声明 end***************************/

            //全局事件
            //窗口选中事件
        window.GetSelectWndInfo = function (SelectWndInfo) {
            var xmlDoc = m_utilsInc.loadXML(SelectWndInfo);
            m_iSelWnd = parseInt(NS.$XML(xmlDoc).find("SelectWnd").eq(0).text(), 10);

            //除了窗口号，其它参数都不准确，需要过滤掉
            var arrXml = [];
            arrXml.push("<RealPlayInfo>");
            arrXml.push("<SelectWnd>" + m_iSelWnd + "</SelectWnd>");
            arrXml.push("</RealPlayInfo>");

            if(m_options.cbSelWnd) {// 用户设置了回调函数
                m_options.cbSelWnd(m_utilsInc.loadXML(arrXml.join("")));
            }
        };

        //3D放大回调
        window.ZoomInfoCallback = function (szZoomInfo) {
            var iIndex = m_webVideoCtrl.findWndIndexByIndex(m_iSelWnd);
            if(iIndex != -1) {
                var oWndInfo = m_wndSet[iIndex];
                iIndex = m_webVideoCtrl.findDeviceIndexByIP(oWndInfo.szIP);
                if(iIndex != -1) {
                    var oDeviceInfo = m_deviceSet[iIndex];
                    oDeviceInfo.oProtocolInc.set3DZoom(oDeviceInfo, oWndInfo, szZoomInfo, {
                        success: function (xmlDoc) {

                        },
                        error: function () {

                        }
                    });
                }
            }
        };

        //插件事件
        window.PluginEventHandler = function (iEventType, iParam1, iParam2) {
            _PrintString("插件事件：PluginEventHandler iEventType：%s iParam1: %s, iParam2: %s", iEventType, iParam1, iParam2);

            if(PLUGIN_EVENTTYPE_PLAYABNORMAL == iEventType || PLUGIN_EVENTTYPE_PLAYBACKSTOP == iEventType) {
                //回放停止和回放异常都需要停止回放
                m_webVideoCtrl.I_Stop(iParam1);
            } else if(PLUGIN_EVENTTYPE_NOFREESPACE == iEventType) {
                //PC机没有足够的录像空间，停止录像
                m_webVideoCtrl.I_StopRecord(iParam1);
            } else if(PLUGIN_EVENTTYPE_AUDIOTALKFAIL == iEventType) {
                //语音对讲失败，停止语音对讲
                m_webVideoCtrl.I_StopVoiceTalk();
            } else {
                //暂时只有4个事件类型
            }

            //调用用户传递的回调函数
            if(m_options.cbEvent) {
                m_options.cbEvent(iEventType, iParam1, iParam2);
            }
        };

        //Http请求返回事件
        window.GetHttpInfo = function (lID, lpInfo, lReverse) {
            _PrintString("http响应返回：http状态：%s, http数据：%s", lID, lpInfo);
            HttpPluginClient.prototype.processCallback(lID, lpInfo);  //http请求返回后，调用HttpPluginClient，让他处理结果
        };

        /***插件接口定义说明***********
         插件的所有私有函数都用var声明，并且函数名之前加上“_”，声明的时候需要小心，以免局部变量冲突
         插件的外部接口用this声明*/
        /************************插件私有方法 start***************************/
        var _PrintString = function () {
            if(m_options.bDebugMode) {
                var printString = _FormatString(arguments);
                m_systemInstance._alert(printString);
            }
        };

        var _FormatString = function () {
            var string = arguments[0];
            for (var i = 1; i < arguments.length; i++) {
                string = string.replace("%s", arguments[i]);
            }
            return string;
        };

        var _isUndefined = function (o) {
            return typeof o === "undefined";
        };

        //生成插件插入的string，所有插入接口都要调用这个方法，定义为私有
        var _generateObject = function () {
            var ObjectHtml = "";

            if(!m_utilsInc.browser().msie) {
                var len = navigator.mimeTypes.length;
                for (var i = 0; i < len; i++) {
                    if(navigator.mimeTypes[i].type.toLowerCase() == m_options.szMimeTypes) {
                        //直接写死为普通预览模式，以后再修改
                        ObjectHtml = "<embed align='center' type='" + m_options.szMimeTypes +
                            "' width='" + m_szWidth +
                            "' height='" + m_szHeight +
                            "' name='" + m_szPluginName +
                            "' wndtype='" + m_options.iWndowType +
                            "' playmode='" + m_options.iPlayMode +
                            "' colors='" + m_options.szColorProperty + "'>";
                    }
                }
            } else {
                ObjectHtml = "<object classid='" + m_options.szOcxClassId +
                    "' codebase='' standby='Waiting...' " +
                    "id='" + m_szPluginID +
                    "' width='" + m_szWidth +
                    "' height='" + m_szHeight +
                    "' align='center' >" +
                    "<param name='wndtype' value='" + m_options.iWndowType + "'>" +
                    "<param name='playmode' value='" + m_options.iPlayMode + "'>" +
                    "<param name='colors' value='" + m_options.szColorProperty + "'></object>";
            }

            return ObjectHtml;
        };

        // 获取本地参数
        var _initLocalCfg = function () {
            var szLocalCofing = m_pluginOBJECT.HWP_GetLocalConfig(),
                arrXml = [];

            m_xmlLocalCfg = m_utilsInc.loadXML(szLocalCofing);
        };

        // 初始化设备参数
        var _initDeviceInfo = function (deviceInfo) {
            m_webVideoCtrl.I_GetDeviceInfo(deviceInfo.szIP, {
                success: function (xmlDoc) {
                    deviceInfo.szDeviceType = NS.$XML(xmlDoc).find("deviceType").eq(0).text();
                }
            });

            m_webVideoCtrl.I_GetAnalogChannelInfo(deviceInfo.szIP, {
                success: function (xmlDoc) {
                    deviceInfo.iAnalogChannelNum = NS.$XML(xmlDoc).find("VideoInputChannel", true).length;
                }
            });

            m_webVideoCtrl.I_GetAudioInfo(deviceInfo.szIP, {
                success: function (xmlDoc) {
                    var oNodeList = NS.$XML(xmlDoc).find("audioCompressionType", true);
                    if(oNodeList.length > 0) {
                        var szAudioCompressionType = NS.$XML(oNodeList).eq(0).text(),
                            iAudioType = 0;//G.722
                        if("G.711ulaw" == szAudioCompressionType) {
                            iAudioType = 1;
                        } else if("G.711alaw" == szAudioCompressionType) {
                            iAudioType = 2;
                        } else if("G.726" == szAudioCompressionType) {
                            iAudioType = 3;
                        }
                        deviceInfo.iAudioType = iAudioType;
                    }
                }
            });
        };

        // 初始化插件参数
        var _initPluginParam = function () {
            var iWndFull = m_options.bWndFull ? 1 : 0;
            m_pluginOBJECT.HWP_SetCanFullScreen(iWndFull);
        };

        // 获取端口
        var _getPort = function (deviceInfo) {
            var iRtspPort = -1,//rtsp端口
                iHttpPort = -1, //HTTP端口
                iDevicePort = -1,// 设备端口
                oPort = null;
            //一定要同步获取，因为接下来会进行预览，必须知道RTSP端口号
            if(_getPPPoEEnable(deviceInfo)) {
                oPort = _getInternalPort(deviceInfo);
                iRtspPort = oPort.iRtspPort;
                iDevicePort = oPort.iDevicePort;
            } else {
                //PPPoE没有开启，则要先获取到设备的真实IP地址
                var ipset = _getDeviceIPAddr(deviceInfo);
                var bSame = false;
                for (var i = 0; i < ipset.length; i++) {
                    if(ipset[i].ipv4 == deviceInfo.szIP || ipset[i].ipv6 == deviceInfo.szIP) {
                        bSame = true;
                        break;
                    }
                }

                //如果两个地址相同，则使用内部端口
                if(bSame) {
                    oPort = _getInternalPort(deviceInfo);
                } else {
                    //如果地址不同，则使用外部端口
                    oPort = _getExternalPort(deviceInfo);
                    //如果外部端口获取失败，则使用内部端口
                    if(-1 == oPort.iRtspPort && -1 == oPort.iDevicePort) {
                        oPort = _getInternalPort(deviceInfo);
                    }
                }

                iRtspPort = oPort.iRtspPort;
                iHttpPort = oPort.iHttpPort;
                iDevicePort = oPort.iDevicePort;
            }
            return oPort;
        };

        // 获取内部端口
        var _getInternalPort = function (deviceInfo) {
            var iRtspPort = -1,
                iHttpPort = -1,
                iDevicePort = -1;
            deviceInfo.oProtocolInc.getPortInfo(deviceInfo, {
                async: false,
                success: function (xmlDoc) {
                    var nodeList = NS.$XML(xmlDoc).find("AdminAccessProtocol", true);
                    iRtspPort = 554;// 抓拍机不返回<protocol>rtsp</protocol>节点
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        if(NS.$XML(nodeList).eq(i).find("protocol").eq(0).text().toLowerCase() === "rtsp") {
                            iRtspPort = parseInt(NS.$XML(nodeList).eq(i).find("portNo").eq(0).text(), 10);
                        }
                        if(NS.$XML(nodeList).eq(i).find("protocol").eq(0).text().toLowerCase() === "http") {
                            iHttpPort = parseInt(NS.$XML(nodeList).eq(i).find("portNo").eq(0).text(), 10);
                        }
                        if(NS.$XML(nodeList).eq(i).find("protocol").eq(0).text().toLowerCase() === "dev_manage") {
                            iDevicePort = parseInt(NS.$XML(nodeList).eq(i).find("portNo").eq(0).text(), 10);
                        }
                    }
                },
                error: function () {
                    //获取外部端口是可能失败的，失败就返回-1，由调用者来处理
                    iRtspPort = -1;
                    iHttpPort = -1;
                    iDevicePort = -1;
                }
            });
            return {
                iRtspPort: iRtspPort,
                iHttpPort: iHttpPort,
                iDevicePort: iDevicePort
            };
        };

        //获取外部端口
        var _getExternalPort = function (deviceInfo) {
            var iRtspPort = -1,
                iHttpPort = -1,
                iDevicePort = -1;
            deviceInfo.oProtocolInc.getUPnPPortStatus(deviceInfo, {
                async: false,
                success: function (xmlDoc) {
                    var nodeList = NS.$XML(xmlDoc).find("portStatus", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        if(NS.$XML(nodeList).eq(i).find("internalPort").eq(0).text().toLowerCase() == "rtsp") {
                            iRtspPort = parseInt(NS.$XML(nodeList).eq(i).find("externalPort").eq(0).text(), 10);
                        }
                        if(NS.$XML(nodeList).eq(i).find("internalPort").eq(0).text().toLowerCase() == "http") {
                            iHttpPort = parseInt(NS.$XML(nodeList).eq(i).find("externalPort").eq(0).text(), 10);
                        }
                        if(NS.$XML(nodeList).eq(i).find("internalPort").eq(0).text().toLowerCase() == "admin") {
                            iDevicePort = parseInt(NS.$XML(nodeList).eq(i).find("externalPort").eq(0).text(), 10);
                        }
                    }
                },
                error: function () {
                    //获取外部端口是可能失败的，失败就返回-1，由调用者来处理
                    iRtspPort = -1;
                    iHttpPort = -1;
                    iDevicePort = -1;
                }
            });
            return {
                iRtspPort: iRtspPort,
                iHttpPort: iHttpPort,
                iDevicePort: iDevicePort
            };
        };

        //获取设备的外部地址，（函数名不太确定，需要修改）,返回对象数组[{ipv4 ipv6}...]
        var _getDeviceIPAddr = function (deviceInfo) {
            var arrIP = [];
            deviceInfo.oProtocolInc.getNetworkBond(deviceInfo, {
                async: false,
                success: function (xmlDoc) {
                    if(NS.$XML(xmlDoc).find("enabled").eq(0).text() == "true") {
                        arrIP.push({
                            "ipv4": NS.$XML(xmlDoc).find("ipAddress").eq(0).text(),
                            "ipv6": NS.$XML(xmlDoc).find("ipv6Address").eq(0).text()
                        });
                    } else {
                        deviceInfo.oProtocolInc.getNetworkInterface(deviceInfo, {
                            async: false,
                            success: function (xmlDoc) {
                                var nodeList = NS.$XML(xmlDoc).find("NetworkInterface", true);
                                for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                                    arrIP.push({
                                        "ipv4": NS.$XML(xmlDoc).find("ipAddress").eq(0).text(),
                                        "ipv6": NS.$XML(xmlDoc).find("ipv6Address").eq(0).text()
                                    });
                                    break;
                                }
                            },
                            error: function () {
                                //到此处不会再失败了
                            }
                        });
                    }
                },
                error: function () {
                    deviceInfo.oProtocolInc.getNetworkInterface(deviceInfo, {
                        async: false,
                        success: function (xmlDoc) {
                            var nodeList = NS.$XML(xmlDoc).find("NetworkInterface", true);
                            for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                                arrIP.push({
                                    "ipv4": NS.$XML(xmlDoc).find("ipAddress").eq(0).text(),
                                    "ipv6": NS.$XML(xmlDoc).find("ipv6Address").eq(0).text()
                                });
                                break;
                            }
                        },
                        error: function () {
                            //到此处不会再失败了
                        }
                    });
                }
            });

            return arrIP;
        };

        // 获取PPPoE
        var _getPPPoEEnable = function (deviceInfo) {
            var bEnabled = false;

            deviceInfo.oProtocolInc.getPPPoEStatus(deviceInfo, {
                async: false,
                success: function (xmlDoc) {
                    if(NS.$XML(xmlDoc).find("ipAddress", true).length > 0) {
                        //此处还需要修改，需要判断IP地址是否合法
                        bEnabled = true;
                    } else if(NS.$XML(xmlDoc).find("ipv6Address", true).length > 0) {
                        //此处还需要修改，需要判断IP地址是否合法
                        bEnabled = true;
                    } else {
                        bEnabled = false;
                    }
                },
                error: function () {
                    bEnabled = false;
                }
            });
            return bEnabled;
        };

        // 关闭声音
        var _closeWndSound = function () {
            for (var i = 0, iLen = m_wndSet.length; i < iLen; i++) {
                var wnd = m_wndSet[i];
                if(wnd.bSound) {
                    var iRet = m_pluginOBJECT.HWP_CloseSound();
                    if(0 == iRet) {
                        wnd.bSound = false;
                    }
                }
            }
        };


        //初始化设备SDK能力（取流能力）
        var _initDeviceStreamCapa = function (deviceInfo) {
            //初始化一次
            if(deviceInfo.oStreamCapa.bObtained) {
                return;
            }

            //只有ISAPI协议存在SDK能力
            if(deviceInfo.oProtocolInc instanceof ISAPIProtocol) {
                //前端码流能力
                if(DEVICE_TYPE_IPCAMERA == deviceInfo.szDeviceType
                    || DEVICE_TYPE_IPDOME == deviceInfo.szDeviceType
                    || DEVICE_TYPE_IPZOOM == deviceInfo.szDeviceType) {
                    deviceInfo.oProtocolInc.getStreamChannels(deviceInfo, {
                        async: false,
                        success: function (xmlDoc) {
                            deviceInfo.oStreamCapa.bObtained = true;

                            var iLen = $(xmlDoc).find("streamingTransport", true).length;
                            for (var i = 0; i < iLen; i++) {
                                if($(xmlDoc).find("streamingTransport").eq(i).text().toLowerCase() == 'shttp') {
                                    deviceInfo.oStreamCapa.bObtained = true;
                                    deviceInfo.oStreamCapa.bSupportShttpPlay = true;
                                    deviceInfo.oStreamCapa.bSupportShttpPlayback = true;
                                    deviceInfo.oStreamCapa.bSupportShttpsPlay = true;
                                    deviceInfo.oStreamCapa.bSupportShttpsPlayback = true;
                                    deviceInfo.oStreamCapa.iIpChanBase = 1;
                                    break;
                                }
                            }
                        },
                        error: function () {

                        }
                    })
                } else {
                    //后端码流能力
                    deviceInfo.oProtocolInc.getSDKCapa(deviceInfo, {
                        async: false,
                        success: function (xmlDoc) {
                            deviceInfo.oStreamCapa.bObtained = true;
                            deviceInfo.oStreamCapa.bSupportShttpPlay = NS.$XML(xmlDoc).find("isSupportHttpPlay").eq(0).text() === "true";
                            deviceInfo.oStreamCapa.bSupportShttpPlayback = NS.$XML(xmlDoc).find("isSupportHttpPlayback").eq(0).text() === "true";
                            deviceInfo.oStreamCapa.bSupportShttpsPlay = NS.$XML(xmlDoc).find("isSupportHttpsPlay").eq(0).text() === "true";
                            deviceInfo.oStreamCapa.bSupportShttpsPlayback = NS.$XML(xmlDoc).find("isSupportHttpsPlayback").eq(0).text() === "true";
                            deviceInfo.oStreamCapa.bSupportShttpPlaybackTransCode = NS.$XML(xmlDoc).find("isSupportHttpTransCodePlayback").eq(0).text() === "true";
                            deviceInfo.oStreamCapa.bSupportShttpsPlaybackTransCode = NS.$XML(xmlDoc).find("isSupportHttpsTransCodePlayback").eq(0).text() === "true";
                            if(NS.$XML(xmlDoc).find("ipChanBase", true).length > 0) {
                                deviceInfo.oStreamCapa.iIpChanBase = parseInt(NS.$XML(xmlDoc).find("ipChanBase").eq(0).text(), 10);
                            }
                        },
                        error: function () {
                            //获取失败,不要再获取，不支持就使用RTSP协议
                            deviceInfo.oStreamCapa.bObtained = true;
                        }
                    });
                }
            }
        };

        //根据用户传入对象生成转码回放XML
        var _generateTransCodeXml = function (oTransCodeParam) {
            var oDefaultParam = {
                TransFrameRate: "",
                TransResolution: "",
                TransBitrate: ""
            };

            m_utilsInc.extend(oDefaultParam, oTransCodeParam);
            if(oDefaultParam.TransFrameRate == "" || oDefaultParam.TransResolution == ""
                || oDefaultParam.TransBitrate == "") {
                return "";
            }

            var ArraySet = [];
            ArraySet.push("<?xml version='1.0' encoding='UTF-8'?>");
            ArraySet.push("<CompressionInfo>");
            ArraySet.push("<TransFrameRate>" + oDefaultParam.TransFrameRate + "</TransFrameRate>")
            ArraySet.push("<TransResolution>" + oDefaultParam.TransResolution + "</TransResolution>");
            ArraySet.push("<TransBitrate>" + oDefaultParam.TransBitrate + "</TransBitrate>");
            ArraySet.push("</CompressionInfo>");

            return ArraySet.join("");
        }

        /************************插件私有方法 end***************************/


        /************************插件嵌入 start***************************/
            //插件对外接口，用于初始化插件的参数，自动生成ID
        this.I_InitPlugin = function (szWidth, szHight, options) {
            m_szWidth = szWidth;
            m_szHeight = szHight;

            m_utilsInc.extend(m_options, options);
        };

        //插件对外接口，在网页中插入插件对象
        this.I_InsertOBJECTPlugin = function (szContainerID) {
            if(!_isUndefined(szContainerID)) {
                m_options.szContainerID = szContainerID;
            }

            //检测容器是否存在
            if(document.getElementById(m_options.szContainerID) == null) {
                return -1;
            }

            //检测插件的ID是否已经存在
            if(document.getElementById(m_szPluginID) != null || document.getElementsByName(m_szPluginID).length != 0) {
                return -1;
            }

            document.getElementById(m_options.szContainerID).innerHTML = _generateObject();

            //获取插件对象
            if(!m_utilsInc.browser().msie) {
                m_pluginOBJECT = document.getElementsByName(m_szPluginName)[0];
            } else {
                m_pluginOBJECT = document.getElementById(m_szPluginID);
            }

            //通过查看插件对象是否为空，来检测是否插入成功
            if(m_pluginOBJECT == null && m_pluginOBJECT.object == null) {
                return -1;
            } else {
                //IE浏览器绑定OCX插件事件处理函数
                if(typeof window.attachEvent == "object" && m_utilsInc.browser().msie) {
                    m_pluginOBJECT.attachEvent("GetSelectWndInfo", GetSelectWndInfo);
                    m_pluginOBJECT.attachEvent("ZoomInfoCallback", ZoomInfoCallback);
                    m_pluginOBJECT.attachEvent("GetHttpInfo", GetHttpInfo);
                    m_pluginOBJECT.attachEvent("PluginEventHandler", PluginEventHandler);
                } else {
                    //IE11之后的IE浏览器不再支持 attachEvent 方法，无法动态绑定插件事件，加载完JS文件后后，马上就在JS文件下方插入SCRIPT标签
                }
            }
            //获取本地参数
            _initLocalCfg();
            return 0;
        };

        //插件对外接口，直接在html中写入插件
        this.I_WriteOBJECT_XHTML = function () {
            document.writeln(_generateObject());

            //获取插件对象
            if(!m_utilsInc.browser().msie) {
                m_pluginOBJECT = document.getElementsByName(m_szPluginName)[0];
            } else {
                m_pluginOBJECT = document.getElementById(m_szPluginID);
            }

            //通过查看插件对象是否为空，来检测是否插入成功
            if(m_pluginOBJECT == null && m_pluginOBJECT.object == null) {
                return -1;
            } else {
                //IE浏览器绑定OCX插件事件处理函数
                if(m_utilsInc.browser().msie) {
                    m_pluginOBJECT.attachEvent("GetSelectWndInfo", GetSelectWndInfo);
                    m_pluginOBJECT.attachEvent("ZoomInfoCallback", ZoomInfoCallback);
                    m_pluginOBJECT.attachEvent("GetHttpInfo", GetHttpInfo);
                    m_pluginOBJECT.attachEvent("PluginEventHandler", PluginEventHandler);
                }
            }

            //获取本地参数
            _initLocalCfg();
            return 0;
        };
        /************************插件嵌入 end*****************************/

        /************************插件操作接口 start*****************************/

        /*************************************************
         Function:        I_OpenFileDlg
         Description:    打开选择框
         Input:            iType：0：文件夹  1：文件
         Output:            无
         return:            无
         *************************************************/
        this.I_OpenFileDlg = function (iType) {
            var szRet = m_pluginOBJECT.HWP_OpenFileBrowser(iType, "");

            if(szRet != null) {
                if(1 == iType) {
                    if(szRet.length > 100) {
                        return -1;
                    }
                } else {
                    if(szRet.length > 130) {
                        return -1;
                    }
                }
            } else {
                return "";
            }

            return szRet;
        };

        /*************************************************
         Function:        I_GetLocalCfg
         Description:    获取本地参数
         Input:            无
         Output:        无
         return:        无
         *************************************************/
        this.I_GetLocalCfg = function () {
            var szLocalCofing = m_pluginOBJECT.HWP_GetLocalConfig(),
                arrXml = [];

            m_xmlLocalCfg = m_utilsInc.loadXML(szLocalCofing);

            arrXml.push("<LocalConfigInfo>");
            arrXml.push("<ProtocolType>" + NS.$XML(m_xmlLocalCfg).find("ProtocolType").eq(0).text() + "</ProtocolType>");
            arrXml.push("<PackgeSize>" + NS.$XML(m_xmlLocalCfg).find("PackgeSize").eq(0).text() + "</PackgeSize>");
            arrXml.push("<PlayWndType>" + NS.$XML(m_xmlLocalCfg).find("PlayWndType").eq(0).text() + "</PlayWndType>");
            arrXml.push("<BuffNumberType>" + NS.$XML(m_xmlLocalCfg).find("BuffNumberType").eq(0).text() + "</BuffNumberType>");
            arrXml.push("<RecordPath>" + NS.$XML(m_xmlLocalCfg).find("RecordPath").eq(0).text() + "</RecordPath>");
            arrXml.push("<CapturePath>" + NS.$XML(m_xmlLocalCfg).find("CapturePath").eq(0).text() + "</CapturePath>");
            arrXml.push("<PlaybackFilePath>" + NS.$XML(m_xmlLocalCfg).find("PlaybackFilePath").eq(0).text() + "</PlaybackFilePath>");
            arrXml.push("<PlaybackPicPath>" + NS.$XML(m_xmlLocalCfg).find("PlaybackPicPath").eq(0).text() + "</PlaybackPicPath>");
            arrXml.push("<DownloadPath>" + NS.$XML(m_xmlLocalCfg).find("DownloadPath").eq(0).text() + "</DownloadPath>");
            arrXml.push("<IVSMode>" + NS.$XML(m_xmlLocalCfg).find("IVSMode").eq(0).text() + "</IVSMode>");
            arrXml.push("<CaptureFileFormat>" + NS.$XML(m_xmlLocalCfg).find("CaptureFileFormat").eq(0).text() + "</CaptureFileFormat>");
            arrXml.push("</LocalConfigInfo>");

            return m_utilsInc.loadXML(arrXml.join(""));
        };

        /*************************************************
         Function:        I_SetLocalCfg
         Description:    设置本地参数
         Input:            无
         Output:        无
         return:        true/false
         *************************************************/
        this.I_SetLocalCfg = function (szLocalCofing) {
            var xmlDoc = m_utilsInc.loadXML(szLocalCofing),
                iRet = -1;

            NS.$XML(m_xmlLocalCfg).find("ProtocolType").eq(0).text(NS.$XML(xmlDoc).find("ProtocolType").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("PackgeSize").eq(0).text(NS.$XML(xmlDoc).find("PackgeSize").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("PlayWndType").eq(0).text(NS.$XML(xmlDoc).find("PlayWndType").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("BuffNumberType").eq(0).text(NS.$XML(xmlDoc).find("BuffNumberType").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("RecordPath").eq(0).text(NS.$XML(xmlDoc).find("RecordPath").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("CapturePath").eq(0).text(NS.$XML(xmlDoc).find("CapturePath").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("PlaybackFilePath").eq(0).text(NS.$XML(xmlDoc).find("PlaybackFilePath").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("PlaybackPicPath").eq(0).text(NS.$XML(xmlDoc).find("PlaybackPicPath").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("DownloadPath").eq(0).text(NS.$XML(xmlDoc).find("DownloadPath").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("IVSMode").eq(0).text(NS.$XML(xmlDoc).find("IVSMode").eq(0).text());
            NS.$XML(m_xmlLocalCfg).find("CaptureFileFormat").eq(0).text(NS.$XML(xmlDoc).find("CaptureFileFormat").eq(0).text());

            iRet = m_pluginOBJECT.HWP_SetLocalConfig(m_utilsInc.toXMLStr(m_xmlLocalCfg));

            return iRet ? 0 : -1;
        };

        var _loginDevice = function (szIP, iProtocol, iPort, szAuth, iCgi, oCgiInstance, options) {
            var newOptions = {
                protocol: iProtocol,
                success: null,
                error: null
            };

            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    //登录成功，需要把设备加入已经登录的列表中
                    var deviceInfo = new deviceInfoClass();
                    deviceInfo.szIP = szIP;
                    if(iProtocol == 2) {
                        deviceInfo.szHttpProtocol = "https://";
                        deviceInfo.iHttpsPort = iPort;
                    } else {
                        deviceInfo.szHttpProtocol = "http://";
                        deviceInfo.iHttpPort = iPort;
                    }
                    deviceInfo.iCGIPort = iPort;
                    deviceInfo.szAuth = szAuth;
                    deviceInfo.iDeviceProtocol = iCgi;
                    deviceInfo.oProtocolInc = oCgiInstance;  //此处把协议索引赋值给设备对象，设备以后的交互都将使用这个对象
                    m_deviceSet.push(deviceInfo);
                    _PrintString("使用%s协议登录成功", iCgi);

                    _initDeviceInfo(deviceInfo);
                    _initPluginParam();

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            oCgiInstance.login(szIP, iPort, szAuth, newOptions);
        }

        /*************************************************
         Function:            I_Login
         Description:        用户登录，并且在此处选择设备交互协议
         Input:                szIP: 设备IP地址
         szProtoType: http协议类型（1：http, 2:https）
         iPort: http端口号
         szUserName: 用户名
         szPassword: 用户密码
         options: 可选参数：async：是否同步（true:异步方式，false:同步方式）
         Output:            无
         return:            无
         *************************************************/
        this.I_Login = function (szIP, iProtocol, iPort, szUserName, szPassword, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                //设备已经在列表中
                _PrintString("设备已经登录过");
                return -1;
            }

            //默认协议是ISAPI
            var cgiInstance = m_ISAPIProtocol;
            var cgiType = PROTOCOL_DEVICE_ISAPI;

            //如果用户选择了协议，按照用户选择的来登录
            if(!_isUndefined(options.cgi)) {
                if(PROTOCOL_DEVICE_ISAPI == options.cgi) {
                    cgiInstance = m_ISAPIProtocol;
                    cgiType = PROTOCOL_DEVICE_ISAPI;
                } else {
                    cgiInstance = m_PSIAProtocol;
                    cgiType = PROTOCOL_DEVICE_PSIA;
                }
            }

            var szAuth = "";
            if(PROTOCOL_DEVICE_ISAPI == cgiType) {
                //如果是ISAPI登录，先使用摘要认证
                szAuth = m_utilsInc.Base64.encode(":" + szUserName + ":" + szPassword);
                var newOptions = {
                    success: null,
                    error: null
                };
                m_utilsInc.extend(newOptions, options);
                m_utilsInc.extend(newOptions, {
                    error: function (httpStatus, xmlDoc) {
                        //登录失败，使用basic认证
                        szAuth = m_utilsInc.Base64.encode( szUserName + ":" + szPassword);
                        cgiType = PROTOCOL_DEVICE_ISAPI;
                        cgiInstance = m_ISAPIProtocol;
                        var newOptions = {
                            success: null,
                            error: null
                        };
                        m_utilsInc.extend(newOptions, options);
                        m_utilsInc.extend(newOptions, {
                            error: function () {
                                //如果是用户自己选择的协议，失败后不再用PSIA协议进行登录
                                if(!_isUndefined(options.cgi)) {
                                    if(options.error) {
                                        options.error(httpStatus, xmlDoc);
                                    }
                                    return;
                                }
                                //如果ISAPI登录失败，则使用PSIA登录，先使用摘要认证
                                szAuth = m_utilsInc.Base64.encode(":" + szUserName + ":" + szPassword);
                                cgiType = PROTOCOL_DEVICE_PSIA;
                                cgiInstance = m_PSIAProtocol;
                                var newOptions = {
                                    success: null,
                                    error: null
                                };
                                m_utilsInc.extend(newOptions, options);
                                m_utilsInc.extend(newOptions, {
                                    error: function (httpStatus, xmlDoc) {
                                        //登录失败，使用basic认证
                                        szAuth = m_utilsInc.Base64.encode( szUserName + ":" + szPassword);
                                        cgiType = PROTOCOL_DEVICE_PSIA;
                                        cgiInstance = m_PSIAProtocol;
                                        var newOptions = {
                                            success: null,
                                            error: null
                                        };
                                        m_utilsInc.extend(newOptions, options);
                                        m_utilsInc.extend(newOptions, {
                                            error: function () {
                                                //如果PSIA还是登录失败，则调用失败错误函数
                                                if(options.error) {
                                                    options.error(httpStatus, xmlDoc);
                                                }
                                            }
                                        });
                                        _loginDevice(szIP, iProtocol, iPort, szAuth, cgiType, cgiInstance, newOptions);
                                    }
                                });
                                _loginDevice(szIP, iProtocol, iPort, szAuth, cgiType, cgiInstance, newOptions);
                            }
                        });
                        _loginDevice(szIP, iProtocol, iPort, szAuth, cgiType, cgiInstance, newOptions);
                    }
                });
                _loginDevice(szIP, iProtocol, iPort, szAuth, cgiType, cgiInstance, newOptions);
            } else {
                //如果是PSIA登录，则必然是用户自己选择的，先使用摘要认证，登录失败直接返回错误即可
                szAuth = m_utilsInc.Base64.encode(":" + szUserName + ":" + szPassword);
                cgiType = PROTOCOL_DEVICE_PSIA;
                cgiInstance = m_PSIAProtocol;
                var newOptions = {
                    success: null,
                    error: null
                };
                m_utilsInc.extend(newOptions, options);
                m_utilsInc.extend(newOptions, {
                    error: function (httpStatus, xmlDoc) {
                        //登录失败，使用basic认证
                        szAuth = m_utilsInc.Base64.encode( szUserName + ":" + szPassword);
                        cgiType = PROTOCOL_DEVICE_PSIA;
                        cgiInstance = m_PSIAProtocol;
                        var newOptions = {
                            success: null,
                            error: null
                        };
                        m_utilsInc.extend(newOptions, options);
                        m_utilsInc.extend(newOptions, {
                            error: function () {
                                //如果PSIA还是登录失败，则调用失败错误函数
                                if(options.error) {
                                    options.error(httpStatus, xmlDoc);
                                }
                            }
                        });
                        _loginDevice(szIP, iProtocol, iPort, szAuth, cgiType, cgiInstance, newOptions);
                    }
                });
                _loginDevice(szIP, iProtocol, iPort, szAuth, cgiType, cgiInstance, newOptions);
            }
        };

        /*************************************************
         Function:        I_Logout
         Description:    用户退出
         Input:            szIP: 设备IP地址
         Output:        无
         return:        成功：0 失败：-1
         *************************************************/
        this.I_Logout = function (szIP) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                m_deviceSet.splice(iIndex, 1);
                return 0;
            }
            return -1;
        };

        /*************************************************
         Function:        I_GetAudioInfo
         Description:    获取音频信息
         Input:            szIP: 设备IP地址
         options: 可选参数：async：是否同步（true:异步方式，false:同步方式）
         Output:            无
         return:            无
         *************************************************/
        this.I_GetAudioInfo = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    success: null,
                    error: null
                };

                m_utilsInc.extend(newOptions, options);

                deviceInfo.oProtocolInc.getAudioInfo(deviceInfo, newOptions);
            }
        };

        /*************************************************
         Function:        I_GetDeviceInfo
         Description:    获取设备信息
         Input:            szIP: 设备IP地址
         options: 可选参数：async：是否同步（true:异步方式，false:同步方式）
         Output:        无
         return:        无
         *************************************************/
        this.I_GetDeviceInfo = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    success: null,
                    error: null
                };

                m_utilsInc.extend(newOptions, options);

                deviceInfo.oProtocolInc.getDeviceInfo(deviceInfo, newOptions);
            }
        };

        /*************************************************
         Function:        I_GetAnalogChannelInfo
         Description:    获取模拟通道
         Input:            szIP: 设备IP地址
         options: 可选参数：async：是否同步（true:异步方式，false:同步方式）
         Output:            无
         return:            无
         *************************************************/
        this.I_GetAnalogChannelInfo = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    success: null,
                    error: null
                };

                m_utilsInc.extend(newOptions, options);

                deviceInfo.oProtocolInc.getAnalogChannelInfo(deviceInfo, newOptions);
            }
        };

        /*************************************************
         Function:        I_GetDigitalChannelInfo
         Description:    获取数字通道
         Input:            szIP: 设备IP地址
         options:        可选参数：async：是否同步（true:异步方式，false:同步方式）
         Output:        无
         return:        无
         *************************************************/
        this.I_GetDigitalChannelInfo = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    success: null,
                    error: null
                };

                m_utilsInc.extend(newOptions, options);

                deviceInfo.oProtocolInc.getDigitalChannelInfo(deviceInfo, newOptions);
            }
        };

        /*************************************************
         Function:        I_GetZeroChannelInfo
         Description:    获取零通道
         Input:            szIP: 设备IP地址
         options:        可选参数：async：是否同步（true:异步方式，false:同步方式）
         Output:        无
         return:        无
         *************************************************/
        this.I_GetZeroChannelInfo = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    success: null,
                    error: null
                };

                m_utilsInc.extend(newOptions, options);

                deviceInfo.oProtocolInc.getZeroChannelInfo(deviceInfo, newOptions);
            }
        };

        /*************************************************
         Function:        I_StartRealPlay
         Description:    开始预览
         Input:            szIP: 设备IP地址
         options: 可选参数
         Output:        无
         return:        成功返回0，失败返回-1
         *************************************************/
        this.I_StartRealPlay = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1,
                cgi = "",
                urlProtocol = "",
                iPort = -1,
                iChannelID = 0,
                iStream = 0,
                bShttpIPChannel = false;

            //默认参数
            var newOptions = {
                iWndIndex: m_iSelWnd,   //默认为当前选中窗口
                iStreamType: 1,			//1：主码流 2：子码流，3:第三码流，4：转码码流
                iChannelID: 1,			//默认为通道1
                bZeroChannel: false	//是否为零通道，默认为非零通道
            };
            m_utilsInc.extend(newOptions, options);

            if(iIndex != -1) {
                //初始化设备SDK能力，是否支持私有取流
                _initDeviceStreamCapa(m_deviceSet[iIndex]);

                var deviceInfo = m_deviceSet[iIndex];

                //协议类型TCP/UDP
                var iProtocolType = parseInt(NS.$XML(m_xmlLocalCfg).find("ProtocolType").eq(0).text(), 10);
                if(iProtocolType == PROTOCOLTYPE_PLAY_TCP && deviceInfo.oStreamCapa.bSupportShttpPlay) {
                    _PrintString("SHTTP RealPlay");
                    //如果当前协议是TCP，并且设备支持私有协议取流，则使用私有协议
                    cgi = deviceInfo.oProtocolInc.CGI.startShttpRealPlay;
                    urlProtocol = "http://"; //私有协议也是使用http://
                    //私有协议码流类型从0开始
                    iStream = newOptions.iStreamType - 1;
                    //私有类型数字通道算法
                    if(newOptions.iChannelID <= deviceInfo.iAnalogChannelNum) {
                        iChannelID = newOptions.iChannelID;
                    } else {
                        iChannelID = deviceInfo.oStreamCapa.iIpChanBase + parseInt(newOptions.iChannelID, 10) - deviceInfo.iAnalogChannelNum - 1;
                    }

                    bShttpIPChannel = true;

                    //计算端口号
                    if(!_isUndefined(newOptions.iPort)) {
                        deviceInfo.iHttpPort = newOptions.iPort;
                        iPort = newOptions.iPort;
                    } else {
                        if(deviceInfo.szHttpProtocol == "https://") {
                            //如果当前设备是使用https登录的，则需要去获取设备的http端口(私有协议是用http端口号)
                            if(-1 == deviceInfo.iHttpPort) {
                                deviceInfo.iHttpPort = _getPort(deviceInfo).iHttpPort;
                            }
                            iPort = deviceInfo.iHttpPort;
                        } else {
                            //如果是http协议登录的，则直接使用登录的端口号即可
                            iPort = deviceInfo.iCGIPort;
                        }
                    }

                } else {
                    //其它情况则使用RTSP取流
                    _PrintString("RTSP RealPlay");
                    cgi = deviceInfo.oProtocolInc.CGI.startRealPlay;
                    urlProtocol = "rtsp://";
                    iStream = newOptions.iStreamType;
                    iChannelID = newOptions.iChannelID;
                    //优先使用用户传入的端口号
                    if(!_isUndefined(newOptions.iPort)) {
                        deviceInfo.iRtspPort = newOptions.iPort;
                    }

                    //表示没有获取过rtsp端口号，需要获取一次
                    if(-1 == deviceInfo.iRtspPort) {
                        deviceInfo.iRtspPort = _getPort(deviceInfo).iRtspPort;
                    }

                    iPort = deviceInfo.iRtspPort;
                }

                if(-1 == iPort) {
                    //如果获取rtsp端口失败，则直接返回，不进行预览
                    _PrintString("获取端口号失败");
                    return iRet;
                }

                //根据设备能力修改的参数
                m_utilsInc.extend(newOptions, {
                    urlProtocol: urlProtocol,
                    cgi: cgi,
                    iPort: iPort,
                    iStreamType: iStream,
                    iChannelID: iChannelID
                });

                iIndex = this.findWndIndexByIndex(newOptions.iWndIndex);
                if(-1 == iIndex) {
                    iRet = deviceInfo.oProtocolInc.startRealPlay(deviceInfo, newOptions);
                }

                //如果失败，则清除保存的端口，下次预览时再重新获取
                if(-1 == iRet) {
                    deviceInfo.iRtspPort = -1;
                } else {
                    iIndex = this.findWndIndexByIndex(newOptions.iWndIndex);
                    var wndInfo = m_wndSet[iIndex];
                    wndInfo.bShttpIPChannel = bShttpIPChannel;// 标识预览私有协议取流
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_Stop
         Description:    关闭播放
         Input:            iWndIndex: 窗口索引
         Output:        无
         return:        成功返回0，失败返回-1
         *************************************************/
        this.I_Stop = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(wndInfo.bRecord) {// 停止录像
                    m_pluginOBJECT.HWP_StopSave(wndInfo.iIndex);
                }
                if(wndInfo.bSound) {// 关闭声音
                    m_pluginOBJECT.HWP_CloseSound();
                }
                if(wndInfo.bEZoom) {// 关闭电子放大
                    m_pluginOBJECT.HWP_DisableZoom(wndInfo.iIndex);
                }

                iRet = m_pluginOBJECT.HWP_Stop(iWndIndex);
                if(0 == iRet) {
                    m_wndSet.splice(iIndex, 1);
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_OpenSound
         Description:    打开声音
         Input:            iWndIndex: 窗口索引
         Output:        无
         return:        成功返回0 失败返回-1
         *************************************************/
        this.I_OpenSound = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(!wndInfo.bSound) {
                    iRet = m_pluginOBJECT.HWP_OpenSound(iWndIndex);
                    if(0 == iRet) {
                        wndInfo.bSound = true;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_CloseSound
         Description:    关闭声音
         Input:            iWndIndex: 窗口索引
         Output:        无
         return:        成功返回0 失败返回-1
         *************************************************/
        this.I_CloseSound = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(wndInfo.bSound) {
                    iRet = m_pluginOBJECT.HWP_CloseSound();
                    if(0 == iRet) {
                        wndInfo.bSound = false;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_SetVolume
         Description:    设置音量
         Input:            iVolume: 音量值 0~100
         iWndIndex: 窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_SetVolume = function (iVolume, iWndIndex) {
            var iRet = -1;
            if(isNaN(parseInt(iVolume, 10))) {
                return iRet;
            }

            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex);
            if(iIndex != -1) {
                iRet = m_pluginOBJECT.HWP_SetVolume(iWndIndex, iVolume);
            }

            return iRet;
        };

        /*************************************************
         Function:        I_CapturePic
         Description:    抓图
         Input:            szPicName: 图片名
         iWndIndex: 窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_CapturePic = function (szPicName, iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                iRet = m_pluginOBJECT.HWP_CapturePicture(iWndIndex, szPicName);
            }

            return iRet;
        };

        /*************************************************
         Function:        I_StartRecord
         Description:    开始录像
         Input:            szFileName: 文件名
         iWndIndex: 窗口索引
         Output:        无
         return:        成功返回0，失败返回-1
         *************************************************/
        this.I_StartRecord = function (szFileName, iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(!wndInfo.bRecord) {
                    iRet = m_pluginOBJECT.HWP_StartSave(iWndIndex, szFileName);
                    if(0 == iRet) {
                        wndInfo.bRecord = true;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_StopRecord
         Description:    停止录像
         Input:            iWndIndex: 窗口索引
         Output:        无
         return:        成功返回0，失败返回-1
         *************************************************/
        this.I_StopRecord = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(wndInfo.bRecord) {
                    iRet = m_pluginOBJECT.HWP_StopSave(iWndIndex);
                    if(0 == iRet) {
                        wndInfo.bRecord = false;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_StartVoiceTalk
         Description:    开始对讲
         Input:            szIP: 设备IP地址
         iAudioChannel: 对讲通道
         Output:        无
         return:        无
         *************************************************/
        this.I_StartVoiceTalk = function (szIP, iAudioChannel) {
            if(isNaN(parseInt(iAudioChannel, 10))) {
                return -1;
            }

            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1;
            if(iIndex != -1) {
                var oDeviceInfo = m_deviceSet[iIndex];

                if(!oDeviceInfo.bVoiceTalk) {
                    iRet = oDeviceInfo.oProtocolInc.startVoiceTalk(oDeviceInfo, iAudioChannel);
                    if(0 == iRet) {
                        m_deviceSet[iIndex].bVoiceTalk = true;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_StopVoiceTalk
         Description:    停止对讲
         Input:            无
         Output:        无
         return:        无
         *************************************************/
        this.I_StopVoiceTalk = function () {
            var iRet = m_pluginOBJECT.HWP_StopVoiceTalk();

            for (var i = 0, iLen = m_deviceSet.length; i < iLen; i++) {
                if(m_deviceSet[i].bVoiceTalk) {
                    m_deviceSet[i].bVoiceTalk = false;
                    break;
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_PTZControl
         Description:    云台控制
         Input:            iPTZIndex：1：上 2：下 3：左 4：右 5：左上 6：左下 7：右上 8：右下 9：自动
         bStop: 是否停止，为true则表示停止iPTZIndex中指定的操作
         options：可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_PTZControl = function (iPTZIndex, bStop, options) {
            var newOptions = {
                iWndIndex: m_iSelWnd,
                iPTZIndex: iPTZIndex,
                iPTZSpeed: 4
            };

            m_utilsInc.extend(newOptions, options);
            //云台强制同步
            m_utilsInc.extend(newOptions, {
                async: false
            });

            var iIndex = this.findWndIndexByIndex(newOptions.iWndIndex);
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];

                iIndex = this.findDeviceIndexByIP(wndInfo.szIP);
                if(iIndex != -1) {
                    var deviceInfo = m_deviceSet[iIndex];

                    if(9 == iPTZIndex) {//自动
                        deviceInfo.oProtocolInc.ptzAutoControl(deviceInfo, bStop, wndInfo, newOptions);
                    } else {
                        deviceInfo.oProtocolInc.ptzControl(deviceInfo, bStop, wndInfo, newOptions);
                    }
                }
            }
        };

        /*************************************************
         Function:        I_EnableEZoom
         Description:    启用电子放大
         Input:            iWndIndex: 窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_EnableEZoom = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(!wndInfo.bEZoom) {
                    iRet = m_pluginOBJECT.HWP_EnableZoom(iWndIndex, 0);
                    if(0 == iRet) {
                        wndInfo.bEZoom = true;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_DisableEZoom
         Description:    禁用电子放大
         Input:            iWndIndex: 窗口索引
         Output:            无
         return:            无
         *************************************************/
        this.I_DisableEZoom = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(wndInfo.bEZoom) {
                    m_pluginOBJECT.HWP_DisableZoom(iWndIndex);
                    wndInfo.bEZoom = false;
                    return 0;// HWP_DisableZoom函数没有返回值，暂时都成功0
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_Enable3DZoom
         Description:    启用3D放大
         Input:            iWndIndex: 窗口索引
         Output:            无
         return:            无
         *************************************************/
        this.I_Enable3DZoom = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(!wndInfo.b3DZoom) {
                    iRet = m_pluginOBJECT.HWP_EnableZoom(iWndIndex, 1);
                    if(0 == iRet) {
                        wndInfo.b3DZoom = true;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_Disable3DZoom
         Description:    禁用3D放大
         Input:            iWndIndex: 窗口索引
         Output:            无
         return:            无
         *************************************************/
        this.I_Disable3DZoom = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];
                if(wndInfo.b3DZoom) {
                    m_pluginOBJECT.HWP_DisableZoom(iWndIndex);
                    wndInfo.b3DZoom = false;
                    return 0;// HWP_DisableZoom函数没有返回值，暂时都成功0
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_FullScreen
         Description:    全屏
         Input:            bFull: true：全屏 false：退出全屏
         Output:        无
         return:        无
         *************************************************/
        this.I_FullScreen = function (bFull) {
            m_pluginOBJECT.HWP_FullScreenDisplay(bFull);
        };

        /*************************************************
         Function:        I_SetPreset
         Description:    设置预置点
         Input:            iPresetID：预置点ID
         options：可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_SetPreset = function (iPresetID, options) {
            var newOptions = {
                iWndIndex: m_iSelWnd,
                iPresetID: iPresetID
            };
            m_utilsInc.extend(newOptions, options);

            var iIndex = this.findWndIndexByIndex(newOptions.iWndIndex);
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];

                iIndex = this.findDeviceIndexByIP(wndInfo.szIP);
                if(iIndex != -1) {
                    var deviceInfo = m_deviceSet[iIndex];

                    deviceInfo.oProtocolInc.setPreset(deviceInfo, wndInfo, newOptions);
                }
            }
        };

        /*************************************************
         Function:        I_GoPreset
         Description:    调用预置点
         Input:            iPresetID：预置点ID
         options：可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_GoPreset = function (iPresetID, options) {
            var newOptions = {
                iWndIndex: m_iSelWnd,
                iPresetID: iPresetID
            };
            m_utilsInc.extend(newOptions, options);

            var iIndex = this.findWndIndexByIndex(newOptions.iWndIndex);
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];

                iIndex = this.findDeviceIndexByIP(wndInfo.szIP);
                if(iIndex != -1) {
                    var deviceInfo = m_deviceSet[iIndex];

                    deviceInfo.oProtocolInc.goPreset(deviceInfo, wndInfo, newOptions);
                }
            }
        };

        /*************************************************
         Function:        I_RecordSearch
         Description:    录像搜索
         Input:            szIP：设备IP
         iChannel：通道号
         szStartTime：开始时间
         szEndTime：结束时间
         options：可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_RecordSearch = function (szIP, iChannelID, szStartTime, szEndTime, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    iChannelID: iChannelID,
                    szStartTime: szStartTime,
                    szEndTime: szEndTime,
                    iSearchPos: 0,
                    success: null,
                    error: null
                };

                m_utilsInc.extend(newOptions, options);

                deviceInfo.oProtocolInc.recordSearch(deviceInfo, newOptions);
            }
        };

        /*************************************************
         Function:        I_StartPlayback
         Description:    开始回放
         Input:            szIP：设备IP
         options：可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_StartPlayback = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1,
                cgi = "",
                urlProtocol = "",
                iPort = -1,
                iChannelID = 1;

            var szCurTime = m_utilsInc.dateFormat(new Date(), "yyyy-MM-dd");

            //默认参数
            var newOptions = {
                iWndIndex: m_iSelWnd,
                iChannelID: 1,			//通道号
                szStartTime: szCurTime + " 00:00:00",
                szEndTime: szCurTime + " 23:59:59"
            };
            m_utilsInc.extend(newOptions, options);

            if(iIndex != -1) {
                //初始化设备SDK能力，是否支持私有取流
                _initDeviceStreamCapa(m_deviceSet[iIndex]);

                var deviceInfo = m_deviceSet[iIndex];

                //协议类型TCP/UDP
                var iProtocolType = parseInt(NS.$XML(m_xmlLocalCfg).find("ProtocolType").eq(0).text(), 10);
                if(iProtocolType == PROTOCOLTYPE_PLAY_TCP && deviceInfo.oStreamCapa.bSupportShttpPlay) {
                    //如果当前协议是TCP，并且设备支持私有协议取流，则使用私有协议
                    if(!_isUndefined(newOptions.oTransCodeParam)) {
                        //如果用户传入了转码码流XML，则使用转码码流回放
                        cgi = deviceInfo.oProtocolInc.CGI.startTransCodePlayback;
                    } else {
                        cgi = deviceInfo.oProtocolInc.CGI.startShttpPlayback;
                    }

                    urlProtocol = "http://"; //私有协议使用http://
                    //私有类型数字通道算法
                    if(newOptions.iChannelID <= deviceInfo.iAnalogChannelNum) {
                        iChannelID = newOptions.iChannelID;
                    } else {
                        iChannelID = deviceInfo.oStreamCapa.iIpChanBase + parseInt(newOptions.iChannelID, 10) - deviceInfo.iAnalogChannelNum - 1;
                    }

                    //优先使用用户传入的通道号
                    if(!_isUndefined(newOptions.iPort)) {
                        deviceInfo.iHttpPort = newOptions.iPort;
                        iPort = newOptions.iPort;
                    } else {
                        if(deviceInfo.szHttpProtocol == "https://") {
                            //如果当前设备是使用https登录的，则需要去获取设备的http端口(私有协议是用http端口号)
                            if(-1 == deviceInfo.iHttpPort) {
                                deviceInfo.iHttpPort = _getPort(deviceInfo).iHttpPort;
                            }
                            iPort = deviceInfo.iHttpPort;
                        } else {
                            //如果是http协议登录的，则直接使用登录的端口号即可
                            iPort = deviceInfo.iCGIPort;
                        }
                    }
                } else {
                    //其它情况则使用RTSP取流
                    cgi = deviceInfo.oProtocolInc.CGI.startPlayback;
                    urlProtocol = "rtsp://";
                    iChannelID = newOptions.iChannelID * 100 + 1;
                    //优先使用用户传入的端口号
                    if(!_isUndefined(newOptions.iPort)) {
                        deviceInfo.iRtspPort = newOptions.iPort;
                    }

                    //表示没有获取过rtsp端口号，需要获取一次
                    if(-1 == deviceInfo.iRtspPort) {
                        deviceInfo.iRtspPort = _getPort(deviceInfo).iRtspPort;
                    }

                    iPort = deviceInfo.iRtspPort;
                }

                if(-1 == iPort) {
                    //如果获取rtsp端口失败，则直接返回，不进行预览
                    _PrintString("获取端口号失败");
                    return iRet;
                }

                //根据逻辑转换的参数
                m_utilsInc.extend(newOptions, {
                    urlProtocol: urlProtocol,
                    cgi: cgi,
                    iPort: iPort,
                    iChannelID: iChannelID
                })

                iIndex = this.findWndIndexByIndex(newOptions.iWndIndex);
                if(-1 == iIndex) {
                    newOptions.szStartTime = (newOptions.szStartTime.replace(/[-:]/g, "")).replace(" ", "T") + "Z";
                    newOptions.szEndTime = (newOptions.szEndTime.replace(/[-:]/g, "")).replace(" ", "T") + "Z";

                    iRet = deviceInfo.oProtocolInc.startPlayback(deviceInfo, newOptions);
                }

                //如果失败，则清除保存的端口，下次预览时再重新获取
                if(-1 == iRet) {
                    deviceInfo.iRtspPort = -1;
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_ReversePlayback
         Description:    开始倒放
         Input:            szIP：设备IP
         options：可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_ReversePlayback = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1,
                cgi = "",
                urlProtocol = "",
                iPort = -1,
                iChannelID = -1;

            var szCurTime = m_utilsInc.dateFormat(new Date(), "yyyy-MM-dd");

            //默认参数
            var newOptions = {
                iWndIndex: m_iSelWnd,
                iChannelID: 1,			//通道号
                bZeroChannel: false,	//是否为零通道
                szStartTime: szCurTime + " 00:00:00", //默认时间为当天
                szEndTime: szCurTime + " 23:59:59"
            };
            m_utilsInc.extend(newOptions, options);

            if(iIndex != -1) {
                //初始化设备SDK能力，是否支持私有取流
                _initDeviceStreamCapa(m_deviceSet[iIndex]);

                var deviceInfo = m_deviceSet[iIndex];

                //协议类型TCP/UDP
                var iProtocolType = parseInt(NS.$XML(m_xmlLocalCfg).find("ProtocolType").eq(0).text(), 10);
                if(iProtocolType == PROTOCOLTYPE_PLAY_TCP && deviceInfo.oStreamCapa.bSupportShttpPlay) {
                    //如果当前协议是TCP，并且设备支持私有协议取流，则使用私有协议
                    cgi = deviceInfo.oProtocolInc.CGI.startShttpReversePlayback;
                    urlProtocol = "http://"; //私有协议也是使用http://
                    if(newOptions.iChannelID <= deviceInfo.iAnalogChannelNum) {
                        iChannelID = newOptions.iChannelID;
                    } else {
                        iChannelID = deviceInfo.oStreamCapa.iIpChanBase + parseInt(newOptions.iChannelID, 10) - deviceInfo.iAnalogChannelNum - 1;
                    }

                    if(!_isUndefined(newOptions.iPort)) {
                        deviceInfo.iHttpPort = newOptions.iPort;
                        iPort = newOptions.iPort;
                    } else {
                        if(deviceInfo.szHttpProtocol == "https://") {
                            //如果当前设备是使用https登录的，则需要去获取设备的http端口(私有协议是用http端口号)
                            if(-1 == deviceInfo.iHttpPort) {
                                deviceInfo.iHttpPort = _getPort(deviceInfo).iHttpPort;
                            }
                            iPort = deviceInfo.iHttpPort;
                        } else {
                            //如果是http协议登录的，则直接使用登录的端口号即可
                            iPort = deviceInfo.iCGIPort;
                        }
                    }
                } else {
                    //其它情况则使用RTSP取流
                    cgi = deviceInfo.oProtocolInc.CGI.startPlayback;
                    urlProtocol = "rtsp://";
                    iChannelID = newOptions.iChannelID * 100 + 1;
                    //优先使用用户传入的端口号
                    if(!_isUndefined(newOptions.iPort)) {
                        deviceInfo.iRtspPort = newOptions.iPort;
                    }

                    //表示没有获取过rtsp端口号，需要获取一次
                    if(-1 == deviceInfo.iRtspPort) {
                        deviceInfo.iRtspPort = _getPort(deviceInfo).iRtspPort;
                    }

                    iPort = deviceInfo.iRtspPort;
                }

                if(-1 == iPort) {
                    //如果获取rtsp端口失败，则直接返回，不进行预览
                    _PrintString("获取端口号失败");
                    return iRet;
                }

                //根据逻辑转换的参数
                m_utilsInc.extend(newOptions, {
                    urlProtocol: urlProtocol,
                    cgi: cgi,
                    iPort: iPort,
                    iChannelID: iChannelID
                });

                iIndex = this.findWndIndexByIndex(newOptions.iWndIndex);
                if(-1 == iIndex) {
                    newOptions.szStartTime = (newOptions.szStartTime.replace(/[-:]/g, "")).replace(" ", "T") + "Z";
                    newOptions.szEndTime = (newOptions.szEndTime.replace(/[-:]/g, "")).replace(" ", "T") + "Z";

                    iRet = deviceInfo.oProtocolInc.reversePlayback(deviceInfo, newOptions);
                }
            }

            //如果失败，则清除保存的端口，下次预览时再重新获取
            if(-1 == iRet) {
                deviceInfo.iRtspPort = -1;
            }

            return iRet;
        };

        /*************************************************
         Function:        I_Frame
         Description:    单帧
         Input:            iWndIndex：窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_Frame = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex],
                    iPlayStatus = wndInfo.iPlayStatus;

                if(iPlayStatus == PLAY_STATUS_PLAYBACK || iPlayStatus == PLAY_STATUS_FRAME) {// 处在回放、单帧状态
                    iRet = m_pluginOBJECT.HWP_FrameForward(iWndIndex);
                    if(0 == iRet) {
                        wndInfo.iPlayStatus = PLAY_STATUS_FRAME;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_Pause
         Description:    暂停
         Input:            iWndIndex：窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_Pause = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex],
                    iPlayStatus = wndInfo.iPlayStatus;

                if(iPlayStatus == PLAY_STATUS_PLAYBACK) {// 处在回放状态
                    iRet = m_pluginOBJECT.HWP_Pause(iWndIndex);
                    if(0 == iRet) {
                        wndInfo.iPlayStatus = PLAY_STATUS_PAUSE;
                    }
                } else if(iPlayStatus == PLAY_STATUS_REVERSE_PLAYBACK) {// 处在倒放状态
                    iRet = m_pluginOBJECT.HWP_Pause(iWndIndex);
                    if(0 == iRet) {
                        wndInfo.iPlayStatus = PLAY_STATUS_REVERSE_PAUSE;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_Resume
         Description:    恢复
         Input:            iWndIndex：窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_Resume = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex],
                    iPlayStatus = wndInfo.iPlayStatus;

                if(iPlayStatus == PLAY_STATUS_PAUSE || iPlayStatus == PLAY_STATUS_FRAME) {// 处在回放暂停、回放单帧状态
                    iRet = m_pluginOBJECT.HWP_Resume(iWndIndex);
                    if(0 == iRet) {
                        wndInfo.iPlayStatus = PLAY_STATUS_PLAYBACK;
                    }
                } else if(iPlayStatus == PLAY_STATUS_REVERSE_PAUSE) {// 处在倒放暂停状态
                    iRet = m_pluginOBJECT.HWP_Resume(iWndIndex);
                    if(0 == iRet) {
                        wndInfo.iPlayStatus = PLAY_STATUS_REVERSE_PLAYBACK;
                    }
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_PlaySlow
         Description:    慢放
         Input:            iWndIndex：窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_PlaySlow = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];

                if(wndInfo.iPlayStatus == PLAY_STATUS_PLAYBACK) {// 处在回放状态
                    iRet = m_pluginOBJECT.HWP_Slow(iWndIndex);
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_PlayFast
         Description:    快放
         Input:            iWndIndex：窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_PlayFast = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var wndInfo = m_wndSet[iIndex];

                if(wndInfo.iPlayStatus == PLAY_STATUS_PLAYBACK) {// 处在回放状态
                    iRet = m_pluginOBJECT.HWP_Fast(iWndIndex);
                }
            }

            return iRet;
        };

        /*************************************************
         Function:        I_GetOSDTime
         Description:    获取OSD时间
         Input:            iWndIndex：窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_GetOSDTime = function (iWndIndex) {
            iWndIndex = _isUndefined(iWndIndex) ? m_iSelWnd : iWndIndex;

            var iIndex = this.findWndIndexByIndex(iWndIndex),
                iRet = -1;
            if(iIndex != -1) {
                var iTime = m_pluginOBJECT.HWP_GetOSDTime(iWndIndex);
                return m_utilsInc.dateFormat(new Date(iTime * 1000), "yyyy-MM-dd hh:mm:ss");
            }

            return iRet;
        };

        /*************************************************
         Function:        I_StartDownloadRecord
         Description:    下载录像
         Input:            szIP: 设备IP
         szPlaybackURI: 下载索引
         szFileName: 文件名
         Output:        无
         return:        无
         *************************************************/
        this.I_StartDownloadRecord = function (szIP, szPlaybackURI, szFileName) {
            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1;
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    szPlaybackURI: szPlaybackURI,
                    szFileName: szFileName
                };

                iRet = deviceInfo.oProtocolInc.startDownloadRecord(deviceInfo, newOptions);
            }

            return iRet;
        };

        /*************************************************
         Function:        I_GetDownloadStatus
         Description:    获取下载状态
         Input:            iDownloadID: 下载ID
         Output:        无
         return:        无
         *************************************************/
        this.I_GetDownloadStatus = function (iDownloadID) {
            var iRet = m_pluginOBJECT.HWP_GetDownloadStatus(iDownloadID);

            if (1 == iRet) {// GetDownloadStatus 插件返回1表示异常，但是开发包文档中描述的是-1，在这里兼容
                iRet = -1;
            }

            return iRet;
        };

        /*************************************************
         Function:        I_GetDownloadProgress
         Description:    获取下载进度
         Input:            iDownloadID: 下载ID
         Output:        无
         return:        无
         *************************************************/
        this.I_GetDownloadProgress = function (iDownloadID) {
            return m_pluginOBJECT.HWP_GetDownloadProgress(iDownloadID);
        };

        /*************************************************
         Function:        I_StopDownloadRecord
         Description:    停止下载
         Input:            iDownloadID: 下载ID
         Output:        无
         return:        无
         *************************************************/
        this.I_StopDownloadRecord = function (iDownloadID) {
            return m_pluginOBJECT.HWP_StopDownload(iDownloadID);
        };

        /*************************************************
         Function:        I_ExportDeviceConfig
         Description:    导出配置文件
         Input:            szIP: 设备IP
         Output:        无
         return:        无
         *************************************************/
        this.I_ExportDeviceConfig = function (szIP) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            var iRet = -1;
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                iRet = deviceInfo.oProtocolInc.exportDeviceConfig(deviceInfo);
            }

            return iRet;
        };

        /*************************************************
         Function:        I_ImportDeviceConfig
         Description:    导入配置文件
         Input:            szIP: 设备IP
         szFileName: 配置文件名
         Output:        无
         return:        无
         *************************************************/
        this.I_ImportDeviceConfig = function (szIP, szFileName) {
            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1;
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    szFileName: szFileName
                };

                iRet = deviceInfo.oProtocolInc.importDeviceConfig(deviceInfo, newOptions);
            }

            return iRet;
        };

        /*************************************************
         Function:        I_RestoreDefault
         Description:    恢复默认值
         Input:          szIP: 设备IP
         szMode    恢复类型：basic-简单恢复 full-完全恢复
         options: 可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_RestoreDefault = function (szIP, szMode, options) {
            var newOptions = {
                success: null,
                error: null
            };
            m_utilsInc.extend(newOptions, options);
            var iIndex = this.findDeviceIndexByIP(szIP);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                deviceInfo.oProtocolInc.restore(deviceInfo, szMode, newOptions);
            }
        };


        /*************************************************
         Function:        I_Restart
         Description:    导入配置文件
         Input:            szIP: 设备IP
         options: 可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_Restart = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            var newOptions = {
                success: null,
                error: null
            };
            m_utilsInc.extend(newOptions, options);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                deviceInfo.oProtocolInc.restart(deviceInfo, newOptions);
            }
        };

        /*************************************************
         Function:        I_Reconnect
         Description:    重连
         Input:            szIP: 设备IP
         options: 可选参数
         Output:        无
         return:        无
         *************************************************/
        this.I_Reconnect = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            var newOptions = {
                success: null,
                error: null
            };
            m_utilsInc.extend(newOptions, options);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                deviceInfo.oProtocolInc.login(deviceInfo.szIP, deviceInfo.iCGIPort, deviceInfo.szAuth, newOptions);
            }
        };

        /*************************************************
         Function:        I_StartUpgrade
         Description:    开始升级
         Input:            szIP: 设备IP
         szFileName: 升级文件名
         Output:        无
         return:        无
         *************************************************/
        this.I_StartUpgrade = function (szIP, szFileName) {
            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1;
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                var newOptions = {
                    szFileName: szFileName
                };

                iRet = deviceInfo.oProtocolInc.startUpgrade(deviceInfo, newOptions);
            }

            return iRet;
        };

        /*************************************************
         Function:        I_UpgradeStatus
         Description:    获取升级状态
         Input:            无
         Output:        无
         return:        无
         *************************************************/
        this.I_UpgradeStatus = function () {
            return m_pluginOBJECT.HWP_UpgradeStatus();
        };

        /*************************************************
         Function:        I_UpgradeProgress
         Description:    获取升级百分比
         Input:            无
         Output:        无
         return:        无
         *************************************************/
        this.I_UpgradeProgress = function () {
            return m_pluginOBJECT.HWP_UpgradeProgress();
        };

        /*************************************************
         Function:        I_StopUpgrade
         Description:    停止升级
         Input:            无
         Output:        无
         return:        无
         *************************************************/
        this.I_StopUpgrade = function () {
            return m_pluginOBJECT.HWP_StopUpgrade();
        };

        /*************************************************
         Function:        I_CheckPluginInstall
         Description:    检查插件是否已安装
         Input:            无
         Output:        无
         return:        -2:浏览器不支持  -1:未安装  0:已安装
         *************************************************/
        this.I_CheckPluginInstall = function () {
            var iInstall = -1;//未安装
            var oBrowser = m_utilsInc.browser();

            // 浏览器不支持插件优先判断
            if (oBrowser.chrome && parseInt(oBrowser.version, 10) > 45) {
                return -2;//浏览器不支持
            }

            if(oBrowser.msie) {
                try {
                    var obj = new ActiveXObject("WebVideoKitActiveX.WebVideoKitActiveXCtrl.1");
                    iInstall = 0;//已安装
                } catch (e) {
                }
            } else {
                for (var i = 0, len = navigator.mimeTypes.length; i < len; i++) {
                    if(navigator.mimeTypes[i].type.toLowerCase() == "application/webvideo-plugin-kit") {
                        iInstall = 0;//已安装
                        break;
                    }
                }
            }

            return iInstall;
        };

        /*************************************************
         Function:        I_CheckPluginVersion
         Description:    检查插件版本
         Input:            无
         Output:        无
         return:        -1:需要升级  0:不用升级
         *************************************************/
        this.I_CheckPluginVersion = function () {
            if(!m_pluginOBJECT.HWP_CheckPluginUpdate(m_szVersion)) {
                return 0;//不用升级
            } else {
                return -1;//需要升级
            }
        };

        /*************************************************
         Function:       I_SendHTTPRequest
         Description:    发送HTTP请求
         Input:          szIP:      设备IP地址
                         szURI:     ISAPI/PSIA协议
                         options:   可选参数：async：是否同步（true:异步方式，false:同步方式）
                                              type: GET、POST、PUT、DELETE
                                              data: xml数据
                                              auth: 认证信息
                                              success: 成功回调
                                              error: 错误回调
         return:         无
         *************************************************/
        this.I_SendHTTPRequest = function (szIP, szURI, options) {
            var iIndex = this.findDeviceIndexByIP(szIP);
            if (iIndex < 0) {
                return;
            }

            var oDeviceInfo = m_deviceSet[iIndex];

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var szURL = oDeviceInfo.szHttpProtocol + oDeviceInfo.szIP + ":" + oDeviceInfo.iCGIPort + "/" + szURI;

            var newOptions = {
                type: "GET",
                url: szURL,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if (options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if (options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        /*************************************************
         Function:        I_RemoteConfig
         Description:    远程配置库
         Input:            无
         Output:        无
         return:        无
         *************************************************/
        this.I_RemoteConfig = function (szIP, options) {
            var iIndex = this.findDeviceIndexByIP(szIP),
                iRet = -1,
                iDevicePort = -1;
            //默认参数
            var newOptions = {
                iLan: 0,// 0：英文，1：中文
                iDevicePort: -1,
                iType: 0
            }
            m_utilsInc.extend(newOptions, options);
            if(iIndex != -1) {
                var deviceInfo = m_deviceSet[iIndex];

                //如果用户没有传入SDK端口号，则自己判断端口号
                if(-1 == newOptions.iDevicePort) {
                    if(-1 == deviceInfo.iDevicePort) {
                        deviceInfo.iDevicePort = _getPort(deviceInfo).iDevicePort;
                        iDevicePort = deviceInfo.iDevicePort;
                        if(-1 == iDevicePort) {
                            //如果获取设备端口失败，则直接返回
                            return iRet;
                        }
                    } else {
                        iDevicePort = deviceInfo.iDevicePort;
                    }
                } else {
                    //如果用户传入了SDK端口号，则使用用户传入的端口号
                    iDevicePort = newOptions.iDevicePort;
                }

                //摘要认证
                if(":" == m_utilsInc.Base64.decode(deviceInfo.szAuth)[0]) {
                    var szUserName = m_utilsInc.Base64.decode(deviceInfo.szAuth).split(":")[1];
                    var szPassword = m_utilsInc.Base64.decode(deviceInfo.szAuth).split(":")[2];
                } else {
                    var szUserName = m_utilsInc.Base64.decode(deviceInfo.szAuth).split(":")[0];
                    var szPassword = m_utilsInc.Base64.decode(deviceInfo.szAuth).split(":")[1];
                }


                var szParamXml = "<RemoteInfo><DeviceInfo><DeviceType>" + newOptions.iType + "</DeviceType>" +
                    "<LanType>" + newOptions.iLan + "</LanType>" +
                    "<IP>" + szIP + "</IP>" +
                    "<Port>" + iDevicePort + "</Port>" +
                    "<UName>" + szUserName + "</UName>" +
                    "<PWD>" + m_utilsInc.Base64.encode(szPassword) + "</PWD></DeviceInfo></RemoteInfo>";

                return m_pluginOBJECT.HWP_ShowRemConfig(szParamXml);
            }

            return iRet;
        };

        /*************************************************
         Function:        I_ChangeWndNum
         Description:    改变窗口分割数
         Input:            iWndType：分割数
         Output:        无
         return:        无
         *************************************************/
        this.I_ChangeWndNum = function (iWndType) {
            if(isNaN(parseInt(iWndType, 10))) {
                return -1;
            }

            m_pluginOBJECT.HWP_ArrangeWindow(iWndType);

            return 0;
        };

        /*************************************************
         Function:        I_GetLastError
         Description:    获取最近一次错误
         Input:            无
         Output:        无
         return:        无
         *************************************************/
        this.I_GetLastError = function () {
            return m_pluginOBJECT.HWP_GetLastError();
        };

        /*************************************************
         Function:        I_GetWindowStatus
         Description:    获取窗口状态
         Input:            iWndIndex：窗口索引
         Output:        无
         return:        无
         *************************************************/
        this.I_GetWindowStatus = function (iWndIndex) {
            if(_isUndefined(iWndIndex)) {
                var wndSet = [];
                m_utilsInc.extend(wndSet, m_wndSet);
                return wndSet;
            } else {
                var i = this.findWndIndexByIndex(iWndIndex);
                if(i != -1) {
                    var wndSet = {};
                    m_utilsInc.extend(wndSet, m_wndSet[i]);
                    return wndSet;
                } else {
                    return null;
                }
            }
        };

        /*************************************************
         Function:        I_GetIPInfoByMode
         Description:    获取设备IP
         Input:            iMode：模式
         szAddress 服务器地址
         iPort  设备SDK端口号
         szDeviceInfo 设备名或设备序列号
         Output:        无
         return:        IP-端口
         *************************************************/
        this.I_GetIPInfoByMode = function (iMode, szAddress, iPort, szDeviceInfo) {
            return m_pluginOBJECT.HWP_GetIpInfoByMode(iMode, szAddress, iPort, szDeviceInfo);
        }

        //根据IP查找对应设备索引
        this.findDeviceIndexByIP = function (szIP) {
            for (var i = 0; i < m_deviceSet.length; i++) {
                if(m_deviceSet[i].szIP == szIP) {
                    return i;
                }
            }
            return -1;
        };

        //根据窗口索引找窗口索引
        this.findWndIndexByIndex = function (iWndIndex) {
            for (var i = 0; i < m_wndSet.length; i++) {
                if(m_wndSet[i].iIndex == iWndIndex) {
                    return i;
                }
            }
            return -1;
        };

        /************************插件操作接口 end*****************************/

        /*********************************插件部分 end*********************************/


        /*********************************设备信息类 start*********************************/
        var deviceInfoClass = function () {
            //一些参数，如果用户没有初始化会使用默认值
            this.szIP = "";
            this.szHostName = "";
            this.szAuth = "";
            this.szHttpProtocol = "http://";  //http类型，https:// or https://
            this.iCGIPort = 80;  //这个端口是当前和设备的CGI协议的交互端口，可能是HTTP端口，也可能是HTTPS端口
            this.iDevicePort = -1;
            this.iHttpPort = -1;
            this.iHttpsPort = -1;
            this.iRtspPort = -1;	//预览的时候获取，如果已经有一个正常的值，就不再重复获取
            this.iAudioType = 1;	// 1：G.711ulaw 2：G.711alaw 3：G.726
            this.iDeviceProtocol = PROTOCOL_DEVICE_ISAPI;  //设备交互协议，默认ISAPI协议
            this.oProtocolInc = null; //设备的交互协议对象，登录的时候赋值
            this.iAnalogChannelNum = 0;
            this.szDeviceType = "";	//设备类型
            this.bVoiceTalk = false;

            this.oStreamCapa = {
                bObtained: false,  //是否已经获取过，能力只获取一次
                bSupportShttpPlay: false,
                bSupportShttpPlayback: false,
                bSupportShttpsPlay: false,
                bSupportShttpsPlayback: false,
                bSupportShttpPlaybackTransCode: false,
                bSupportShttpsPlaybackTransCode: false,
                iIpChanBase: 1
            }
        };

        /*********************************设备信息类 end*********************************/

        /*********************************窗口信息类 start*********************************/
        var wndInfoClass = function () {
            //一些参数，如果用户没有初始化会使用默认值
            this.iIndex = 0;
            this.szIP = "";
            this.iChannelID = "";
            this.iPlayStatus = PLAY_STATUS_STOP;
            this.bSound = false;
            this.bRecord = false;
            this.bPTZAuto = false;
            this.bEZoom = false;
            this.b3DZoom = false;
        };
        /*********************************窗口信息类 end*********************************/

        /*********************************HTTP交互类 start*********************************/
        var HttpPluginClient = function () {
            this.options = {
                type: "GET",
                url: "",
                auth: "",
                timeout: 10000,
                data: "",
                async: true,
                success: null,
                error: null
            };

            //每个请求都有一套数据
            this.m_szHttpHead = "";  //http返回数据的头部
            this.m_szHttpContent = "";  //http返回数据的内容
            this.m_szHttpData = "";  //http返回的整个数据
        };

        //http请求列表，静态成员
        HttpPluginClient.prototype.m_httpRequestSet = [];

        //设置这次请求的参数
        HttpPluginClient.prototype.setRequestParam = function (options) {
            m_utilsInc.extend(this.options, options);
        };

        //投递请求
        HttpPluginClient.prototype.submitRequest = function () {
            var iMethord = this.getHttpMethod(this.options.type),
                httpRequest = null;
            if(this.options.async) {
                var iRequestID = m_pluginOBJECT.HWP_SubmitHttpRequest(iMethord, this.options.url, this.options.auth, this.options.data, this.options.timeout);
                if(iRequestID != -1) {
                    httpRequest = {
                        iRequestID: iRequestID,
                        funSuccessCallback: this.options.success,
                        funErrorCallback: this.options.error
                    };

                    this.m_httpRequestSet.push(httpRequest);
                }
            } else {
                // 同步请求插件方法
                var szHttpContent = m_pluginOBJECT.HWP_SendHttpSynRequest(iMethord, this.options.url, this.options.auth, this.options.data, this.options.timeout);
                httpRequest = {
                    //iRequestID: iRequestID,
                    funSuccessCallback: this.options.success,
                    funErrorCallback: this.options.error
                };
                this.httpDataAnalyse(httpRequest, szHttpContent);
            }
        };

        HttpPluginClient.prototype.getHttpMethod = function (szMethod) {
            var oMethod = {GET: 1, POST: 2, PUT: 5, DELETE: 6},
                iMethod = oMethod[szMethod];

            return iMethod ? iMethod : -1;
        };

        HttpPluginClient.prototype.processCallback = function (iRequstID, szHttpContent) {
            var oHttpRequest = null;  //临时请求对象


            //找到请求的对象
            for (var i = 0; i < this.m_httpRequestSet.length; i++) {
                if(iRequstID == this.m_httpRequestSet[i].iRequestID) {
                    //根据结果调用回调函数
                    oHttpRequest = this.m_httpRequestSet[i];
                    //删除指定请求对象
                    this.m_httpRequestSet.splice(i, 1);
                    break;
                }
            }

            //如果没有找到请求对象，直接返回
            if(null == oHttpRequest) {
                return;
            }

            this.httpDataAnalyse(oHttpRequest, szHttpContent);

            delete oHttpRequest;
        };

        HttpPluginClient.prototype.httpDataAnalyse = function (oHttpRequest, szHttpContent) {
            //数据分析，后续要提出这个部分
            var szHttpBody = "";  //http数据部分
            var iHttpStatus = 0;  //http状态码

            //分析插件传出来的内容，该内容包含了http的状态码和数据
            //如果没有任何数据，表示请求失败
            if("" == szHttpContent || _isUndefined(szHttpContent)) {
                //考虑调用插件的接口来获取错误
                oHttpRequest.funErrorCallback();
            } else {
                //获取http状态码，Http状态码只有3位
                iHttpStatus = parseInt(szHttpContent.substring(0, 3));
                szHttpBody = szHttpContent.substring(3, szHttpContent.length);

                if(!isNaN(iHttpStatus)) {
                    if(HTTP_STATUS_OK_200 == iHttpStatus) {
                        oHttpRequest.funSuccessCallback(m_utilsInc.loadXML(szHttpBody));
                    } else {
                        oHttpRequest.funErrorCallback(iHttpStatus, m_utilsInc.loadXML(szHttpBody));
                    }
                } else {
                    oHttpRequest.funErrorCallback();
                }
            }
        };


        /*********************************HTTP交互类 end*********************************/

        /*********************************ISAPI协议类 start*********************************/
        var ISAPIProtocol = function () {
        };

        //所有ISAPIProtocol new出来的对象都公用一个CGI协议，只是具体的参数不同
        ISAPIProtocol.prototype.CGI = {
            login: "%s%s:%s/ISAPI/Security/userCheck",
            getAudioInfo: "%s%s:%s/ISAPI/System/TwoWayAudio/channels",
            getDeviceInfo: "%s%s:%s/ISAPI/System/deviceInfo",
            getAnalogChannelInfo: "%s%s:%s/ISAPI/System/Video/inputs/channels",
			getDigitalChannel: "%s%s:%s/ISAPI/ContentMgmt/InputProxy/channels",
            getDigitalChannelInfo: "%s%s:%s/ISAPI/ContentMgmt/InputProxy/channels/status",
            getZeroChannelInfo: "%s%s:%s/ISAPI/ContentMgmt/ZeroVideo/channels",
            getStreamChannels: {
                analog: "%s%s:%s/ISAPI/Streaming/channels",
                digital: "%s%s:%s/ISAPI/ContentMgmt/StreamingProxy/channels"
            },
            getStreamDynChannels: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/DynStreaming/channels",//没找到对应协议，没有使用过
            startRealPlay: {
                channels: "%s%s:%s/PSIA/streaming/channels/%s",
                zeroChannels: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/ZeroStreaming/channels/%s"
            },
            startShttpRealPlay: {
                channels: "%s%s:%s/SDK/play/%s/004",
                zeroChannels: "%s%s:%s/SDK/play/100/004/ZeroStreaming"
            },
            startVoiceTalk: {
                open: "%s%s:%s/ISAPI/System/TwoWayAudio/channels/%s/open",
                close: "%s%s:%s/ISAPI/System/TwoWayAudio/channels/%s/close",
                audioData: "%s%s:%s/ISAPI/System/TwoWayAudio/channels/%s/audioData"
            },
            ptzControl: {
                analog: "%s%s:%s/ISAPI/PTZCtrl/channels/%s/continuous",
                digital: "%s%s:%s/ISAPI/ContentMgmt/PTZCtrlProxy/channels/%s/continuous"
            },
            ptzAutoControl: {
                ipdome: "%s%s:%s/ISAPI/PTZCtrl/channels/%s/presets/%s/goto",
                analog: "%s%s:%s/ISAPI/PTZCtrl/channels/%s/autoPan",
                digital: "%s%s:%s/ISAPI/ContentMgmt/PTZCtrlProxy/channels/%s/autoPan"
            },
            setPreset: {
                analog: "%s%s:%s/ISAPI/PTZCtrl/channels/%s/presets/%s",
                digital: "%s%s:%s/ISAPI/ContentMgmt/PTZCtrlProxy/channels/%s/presets/%s"
            },
            goPreset: {
                analog: "%s%s:%s/ISAPI/PTZCtrl/channels/%s/presets/%s/goto",
                digital: "%s%s:%s/ISAPI/ContentMgmt/PTZCtrlProxy/channels/%s/presets/%s/goto"
            },
            //focus
            ptzFocus: {
                analog: "%s%s:%s/ISAPI/Image/channels/%s/focus",
                digital: "%s%s:%s/ISAPI/ContentMgmt/ImageProxy/channels/%s/focus",
                ipc: "%s%s:%s/ISAPI/System/Video/inputs/channels/%s/focus"
            },
            //Iris
            ptzIris: {
                analog: "%s%s:%s/ISAPI/Image/channels/%s/iris",
                digital: "%s%s:%s/ISAPI/ContentMgmt/ImageProxy/channels/%s/iris",
                ipc: "%s%s:%s/ISAPI/System/Video/inputs/channels/%s/iris"
            },
            //网络相关，不暴露给客户，只是为了自己用
            getNetworkBond: "%s%s:%s/ISAPI/System/Network/Bond",
            getNetworkInterface: "%s%s:%s/ISAPI/System/Network/interfaces",
            getUPnPPortStatus: "%s%s:%s/ISAPI/System/Network/UPnP/ports/status",
            getPPPoEStatus: "%s%s:%s/ISAPI/System/Network/PPPoE/1/status",

            //该协议PSIA和ISAPI获取到的参数不同，PSIA要发送两次命令才可获取到所有端口号，PSIA协议暂时没有这个CGI
            getPortInfo: "%s%s:%s/ISAPI/Security/adminAccesses",

            recordSearch: "%s%s:%s/ISAPI/ContentMgmt/search",
            startPlayback: "%s%s:%s/PSIA/streaming/tracks/%s?starttime=%s&endtime=%s",
            startShttpPlayback: "%s%s:%s/SDK/playback/%s",
            startShttpReversePlayback: "%s%s:%s/SDK/playback/%s/reversePlay",
            startTransCodePlayback: "%s%s:%s/SDK/playback/%s/transcoding",
            startDownloadRecord: "%s%s:%s/ISAPI/ContentMgmt/download",
            deviceConfig: "%s%s:%s/ISAPI/System/configurationData",
            restart: "%s%s:%s/ISAPI/System/reboot",
            restore: "%s%s:%s/ISAPI/System/factoryReset?mode=%s",
            startUpgrade: {
                upgrade: "%s%s:%s/ISAPI/System/updateFirmware",
                status: "%s%s:%s/ISAPI/System/upgradeStatus"
            },
            set3DZoom: "%s%s:%s/ISAPI/PTZCtrl/channels/%s/position3D",

            //SDK
            SDKCapabilities: "%s%s:%s/SDK/capabilities"
        };

        ISAPIProtocol.prototype.login = function (szIP, iPort, szAuth, options) {
            //组成url
            var szProtocol = options.protocol == 2 ? "https://" : "http://";
            var url = _FormatString(this.CGI.login, szProtocol, szIP, iPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if("200" == NS.$XML(xmlDoc).find("statusValue").eq(0).text()
                        || "OK" == NS.$XML(xmlDoc).find("statusString").eq(0).text()) {
                        if(options.success) {
                            options.success(xmlDoc);
                        }
                    } else {
                        if(options.error) {
                            options.error(401, xmlDoc);
                        }
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getAudioInfo = function (deviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.getAudioInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: szUrl,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getDeviceInfo = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getDeviceInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<DeviceInfo>");
                    arrXml.push("<deviceName>" + m_utilsInc.escape(NS.$XML(xmlDoc).find("deviceName").eq(0).text()) + "</deviceName>");
                    arrXml.push("<deviceID>" + NS.$XML(xmlDoc).find("deviceID").eq(0).text() + "</deviceID>");
                    arrXml.push("<deviceType>" + NS.$XML(xmlDoc).find("deviceType").eq(0).text() + "</deviceType>");
                    arrXml.push("<model>" + NS.$XML(xmlDoc).find("model").eq(0).text() + "</model>");
                    arrXml.push("<serialNumber>" + NS.$XML(xmlDoc).find("serialNumber").eq(0).text() + "</serialNumber>");
                    arrXml.push("<macAddress>" + NS.$XML(xmlDoc).find("macAddress").eq(0).text() + "</macAddress>");
                    arrXml.push("<firmwareVersion>" + NS.$XML(xmlDoc).find("firmwareVersion").eq(0).text() + "</firmwareVersion>");
                    arrXml.push("<firmwareReleasedDate>" + NS.$XML(xmlDoc).find("firmwareReleasedDate").eq(0).text() + "</firmwareReleasedDate>");
                    arrXml.push("<encoderVersion>" + NS.$XML(xmlDoc).find("encoderVersion").eq(0).text() + "</encoderVersion>");
                    arrXml.push("<encoderReleasedDate>" + NS.$XML(xmlDoc).find("encoderReleasedDate").eq(0).text() + "</encoderReleasedDate>");
                    arrXml.push("</DeviceInfo>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getAnalogChannelInfo = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getAnalogChannelInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<VideoInputChannelList>");

                    var nodeList = NS.$XML(xmlDoc).find("VideoInputChannel", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i];

                        arrXml.push("<VideoInputChannel>");
                        arrXml.push("<id>" + NS.$XML(node).find("id").eq(0).text() + "</id>");
                        arrXml.push("<inputPort>" + NS.$XML(node).find("inputPort").eq(0).text() + "</inputPort>");
                        //arrXml.push("<videoInputEnabled>" + NS.$XML(node).find("videoInputEnabled").eq(0).text() + "</videoInputEnabled>");IPC没有这个节点
                        arrXml.push("<name>" + m_utilsInc.escape(NS.$XML(node).find("name").eq(0).text()) + "</name>");
                        arrXml.push("<videoFormat>" + NS.$XML(node).find("videoFormat").eq(0).text() + "</videoFormat>");
                        arrXml.push("</VideoInputChannel>");
                    }
                    arrXml.push("</VideoInputChannelList>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

		ISAPIProtocol.prototype.getDigitalChannel = function (deviceInfo, options) {
			//组成url
            var url = _FormatString(this.CGI.getDigitalChannel, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<InputProxyChannelList>");

                    var nodeList = NS.$XML(xmlDoc).find("InputProxyChannel", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i];

                        arrXml.push("<InputProxyChannel>");
                        arrXml.push("<id>" + NS.$XML(node).find("id").eq(0).text() + "</id>");
						arrXml.push("<name>" + m_utilsInc.escape(NS.$XML(node).find("name").eq(0).text()) + "</name>");
                        arrXml.push("</InputProxyChannel>");
                    }
                    arrXml.push("</InputProxyChannelList>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));
                   
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

			httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
		};

        ISAPIProtocol.prototype.getDigitalChannelInfo = function (deviceInfo, options) {
			// 获取数字通道的名称，需要单独发送协议获取
			var oDigitalChannelXML = null,
				oDigitalChannelName = {};
			this.getDigitalChannel(deviceInfo, {
				async: false,
				success: function (xmlDoc) {
					oDigitalChannelXML = xmlDoc;
					
					var nodeList = NS.$XML(oDigitalChannelXML).find("InputProxyChannel", true);
					for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
						var node = nodeList[i],
							szId = NS.$XML(node).find("id").eq(0).text(),
							szName = NS.$XML(node).find("name").eq(0).text();

						oDigitalChannelName[szId] = szName;
					}
				},
				error: function (httpStatus, xmlDoc) {
					if (options.error) {
						options.error(httpStatus, xmlDoc);
					}
				}
			});
			if (null === oDigitalChannelXML) {// 请求出错，后面的请求不发送了
				return;
			}

            //组成url
            var url = _FormatString(this.CGI.getDigitalChannelInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<InputProxyChannelStatusList>");

                    var nodeList = NS.$XML(xmlDoc).find("InputProxyChannelStatus", true);					
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i],
							szId = NS.$XML(node).find("id").eq(0).text();

                        arrXml.push("<InputProxyChannelStatus>");
                        arrXml.push("<id>" + szId + "</id>");
                        arrXml.push("<sourceInputPortDescriptor>");
                        arrXml.push("<proxyProtocol>" + NS.$XML(node).find("proxyProtocol").eq(0).text() + "</proxyProtocol>");
                        arrXml.push("<addressingFormatType>" + NS.$XML(node).find("addressingFormatType").eq(0).text() + "</addressingFormatType>");
                        arrXml.push("<ipAddress>" + NS.$XML(node).find("ipAddress").eq(0).text() + "</ipAddress>");
                        arrXml.push("<managePortNo>" + NS.$XML(node).find("managePortNo").eq(0).text() + "</managePortNo>");
                        arrXml.push("<srcInputPort>" + NS.$XML(node).find("srcInputPort").eq(0).text() + "</srcInputPort>");
                        arrXml.push("<userName>" + m_utilsInc.escape(NS.$XML(node).find("userName").eq(0).text()) + "</userName>");
                        arrXml.push("<streamType>" + NS.$XML(node).find("streamType").eq(0).text() + "</streamType>");
                        arrXml.push("<online>" + NS.$XML(node).find("online").eq(0).text() + "</online>");
						arrXml.push("<name>" + m_utilsInc.escape(oDigitalChannelName[szId]) + "</name>");
                        arrXml.push("</sourceInputPortDescriptor>");
                        arrXml.push("</InputProxyChannelStatus>");
                    }
                    arrXml.push("</InputProxyChannelStatusList>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getZeroChannelInfo = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getZeroChannelInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getStreamChannels = function (deviceInfo, options) {
            if(deviceInfo.iAnalogChannelNum != 0) {
                var url = _FormatString(this.CGI.getStreamChannels.analog, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);
            } else {
                var url = _FormatString(this.CGI.getStreamChannels.digital, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);
            }

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        }

        ISAPIProtocol.prototype.getPPPoEStatus = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getPPPoEStatus, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，PPPoE的PSIA和ISAPI返回的内容一模一样，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getUPnPPortStatus = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getUPnPPortStatus, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getNetworkBond = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getNetworkBond, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，PSIA和ISAPI返回的内容一模一样，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getNetworkInterface = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getNetworkInterface, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，PSIA和ISAPI返回的内容一模一样，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        //获取端口,PSIA协议已经做了兼容，和ISAPI一样
        ISAPIProtocol.prototype.getPortInfo = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getPortInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.startRealPlay = function (oDeviceInfo, options) {
            var iChannelID = options.iChannelID * 100 + options.iStreamType,
                szUrl = "";

            //组成url
            if(options.bZeroChannel) {
                szUrl = _FormatString(options.cgi.zeroChannels, options.urlProtocol, oDeviceInfo.szIP, options.iPort, iChannelID);
            } else {
                szUrl = _FormatString(options.cgi.channels, options.urlProtocol, oDeviceInfo.szIP, options.iPort, iChannelID);
            }

            var iRet = m_pluginOBJECT.HWP_Play(szUrl, oDeviceInfo.szAuth, options.iWndIndex, "", "");
            if(0 == iRet) {
                var wndInfo = new wndInfoClass();
                wndInfo.iIndex = options.iWndIndex;
                wndInfo.szIP = oDeviceInfo.szIP;
                wndInfo.iChannelID = options.iChannelID;
                wndInfo.iPlayStatus = PLAY_STATUS_REALPLAY;

                m_wndSet.push(wndInfo);
            }

            return iRet;
        };

        ISAPIProtocol.prototype.startVoiceTalk = function (oDeviceInfo, iAudioChannel) {
            //组成url
            var szOpenUrl = _FormatString(this.CGI.startVoiceTalk.open, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iAudioChannel),
                szCloseUrl = _FormatString(this.CGI.startVoiceTalk.close, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iAudioChannel),
                szAudioDataUrl = _FormatString(this.CGI.startVoiceTalk.audioData, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iAudioChannel);

            var iRet = m_pluginOBJECT.HWP_StartVoiceTalk(szOpenUrl, szCloseUrl, szAudioDataUrl, oDeviceInfo.szAuth, oDeviceInfo.iAudioType);

            return iRet;
        };

        ISAPIProtocol.prototype.ptzAutoControl = function (oDeviceInfo, bStop, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "",
                szData = "";

            options.iPTZSpeed = options.iPTZSpeed < 7 ? options.iPTZSpeed * 15 : 100;
            if(bStop) {
                //停止自转，速度置为0
                options.iPTZSpeed = 0;
            }

            if(oDeviceInfo.szDeviceType != DEVICE_TYPE_IPDOME) {
                if(iChannelID <= oDeviceInfo.iAnalogChannelNum) {
                    szUrl = _FormatString(this.CGI.ptzAutoControl.analog, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
                } else {
                    if(oWndInfo.bShttpIPChannel) {// 私有协议取流
                        szUrl = _FormatString(this.CGI.ptzAutoControl.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, (oWndInfo.iChannelID - oDeviceInfo.oStreamCapa.iIpChanBase + 1 + oDeviceInfo.iAnalogChannelNum));
                    } else {
                        szUrl = _FormatString(this.CGI.ptzAutoControl.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
                    }
                }
                szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                    "<autoPanData>" +
                    "<autoPan>" + options.iPTZSpeed + "</autoPan>" +
                    "</autoPanData>";
            } else {//IPDome
                var iPresetID = 99;
                if(bStop) {
                    iPresetID = 96;
                }
                szUrl = _FormatString(this.CGI.ptzAutoControl.ipdome, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID, iPresetID);
            }

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                async: false,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            var self = this;
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    oWndInfo.bPTZAuto = !oWndInfo.bPTZAuto;
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    //IPC如果调用失败，需要调用另外一条URL
                    if(DEVICE_TYPE_IPCAMERA == oDeviceInfo.szDeviceType
                        || DEVICE_TYPE_IPZOOM == oDeviceInfo.szDeviceType) {
                        if(oWndInfo.bShttpIPChannel) {// 私有协议取流
                            szUrl = _FormatString(self.CGI.ptzControl.analog, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, (oWndInfo.iChannelID - oDeviceInfo.oStreamCapa.iIpChanBase + 1 + oDeviceInfo.iAnalogChannelNum));
                        } else {
                            szUrl = _FormatString(self.CGI.ptzControl.analog, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
                        }

                        szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                            "<PTZData>" +
                            "<pan>" + options.iPTZSpeed + "</pan>" +
                            "<tilt>" + 0 + "</tilt>" +
                            "</PTZData>";

                        //设置请求属性
                        var httpClient = new HttpPluginClient();

                        var newOptions = {
                            type: "PUT",
                            url: szUrl,
                            async: false,
                            auth: oDeviceInfo.szAuth,
                            data: szData,
                            success: null,
                            error: null
                        };

                        m_utilsInc.extend(newOptions, options);
                        httpClient.setRequestParam(newOptions);
                        httpClient.submitRequest();//发送请求
                    } else {
                        //球机或DVR如果自动出错，则直接返回出错
                        if(options.error) {
                            options.error(httpStatus, xmlDoc);
                        }
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.ptzControl = function (oDeviceInfo, bStop, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "";

            if(oWndInfo.bPTZAuto) {
                this.ptzAutoControl(oDeviceInfo, true, oWndInfo, {iPTZSpeed: 0});
            }

            if(bStop) {
                options.iPTZSpeed = 0;
            } else {
                options.iPTZSpeed = options.iPTZSpeed < 7 ? options.iPTZSpeed * 15 : 100;
            }


            var oDirection = [
                {},
                {pan: 0, tilt: options.iPTZSpeed}, // 上
                {pan: 0, tilt: -options.iPTZSpeed}, // 下
                {pan: -options.iPTZSpeed, tilt: 0}, // 左
                {pan: options.iPTZSpeed, tilt: 0}, // 右
                {pan: -options.iPTZSpeed, tilt: options.iPTZSpeed},	// 左上
                {pan: -options.iPTZSpeed, tilt: -options.iPTZSpeed}, // 左下
                {pan: options.iPTZSpeed, tilt: options.iPTZSpeed}, // 右上
                {pan: options.iPTZSpeed, tilt: -options.iPTZSpeed}, // 右下
                {}, //PTZ自动，由其它接口实现，此处不处理
                {speed: options.iPTZSpeed},//zoomin
                {speed: -options.iPTZSpeed}, //zoomout
                {speed: options.iPTZSpeed}, //focusin
                {speed: -options.iPTZSpeed}, //focusout
                {speed: options.iPTZSpeed},  //Irisin
                {speed: -options.iPTZSpeed}   //Irisout
            ];

            var szData = "";
            var oCommond = {};

            switch (options.iPTZIndex) {
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                    //方向命令
                    oCommond = this.CGI.ptzControl;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<PTZData>" +
                        "<pan>" + oDirection[options.iPTZIndex].pan + "</pan>" +
                        "<tilt>" + oDirection[options.iPTZIndex].tilt + "</tilt>" +
                        "</PTZData>";
                    break;
                case 10:
                case 11:
                    //Zoom命令
                    oCommond = this.CGI.ptzControl;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<PTZData>" +
                        "<zoom>" + oDirection[options.iPTZIndex].speed + "</zoom>" +
                        "</PTZData>";
                    break;
                case 12:
                case 13:
                    //focus命令
                    oCommond = this.CGI.ptzFocus;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<FocusData>" +
                        "<focus>" + oDirection[options.iPTZIndex].speed + "</focus>" +
                        "</FocusData>";
                    break;
                case 14:
                case 15:
                    //Iris命令
                    oCommond = this.CGI.ptzIris;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<IrisData>" +
                        "<iris>" + oDirection[options.iPTZIndex].speed + "</iris>" +
                        "</IrisData>";
                    break;
                default :
                    if(_isUndefined(options.error)) {
                        options.error();
                    }
                    return;
            }

            if((oCommond == this.CGI.ptzFocus || oCommond == this.CGI.ptzIris) &&
                (oDeviceInfo.szDeviceType == DEVICE_TYPE_IPCAMERA || oDeviceInfo.szDeviceType == DEVICE_TYPE_IPDOME || oDeviceInfo.szDeviceType == DEVICE_TYPE_IPZOOM)) {
                szUrl = _FormatString(oCommond.ipc, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
            } else {
                if(iChannelID <= oDeviceInfo.iAnalogChannelNum) {
                    szUrl = _FormatString(oCommond.analog, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
                } else {
                    if(oWndInfo.bShttpIPChannel) {// 私有协议取流
                        szUrl = _FormatString(oCommond.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, (oWndInfo.iChannelID - oDeviceInfo.oStreamCapa.iIpChanBase + 1 + oDeviceInfo.iAnalogChannelNum));
                    } else {
                        szUrl = _FormatString(oCommond.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
                    }
                }
            }

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                async: false,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.setPreset = function (oDeviceInfo, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "",
                szData = "";

            if(iChannelID <= oDeviceInfo.iAnalogChannelNum) {
                szUrl = _FormatString(this.CGI.setPreset.analog, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID, options.iPresetID);
            } else {
                if(oWndInfo.bShttpIPChannel) {// 私有协议取流
                    szUrl = _FormatString(this.CGI.setPreset.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, (oWndInfo.iChannelID - oDeviceInfo.oStreamCapa.iIpChanBase + 1 + oDeviceInfo.iAnalogChannelNum), options.iPresetID);
                } else {
                    szUrl = _FormatString(this.CGI.setPreset.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID, options.iPresetID);
                }
            }

            szData = "<?xml version='1.0' encoding='UTF-8'?>";
            szData += "<PTZPreset>";
            szData += "<id>" + options.iPresetID + "</id>";
            if(oDeviceInfo.szDeviceType != DEVICE_TYPE_IPDOME) {
                szData += "<presetName>" + "Preset" + options.iPresetID + "</presetName>";
            }
            szData += "</PTZPreset>";

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.goPreset = function (oDeviceInfo, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "";

            if(iChannelID <= oDeviceInfo.iAnalogChannelNum) {
                szUrl = _FormatString(this.CGI.goPreset.analog, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID, options.iPresetID);
            } else {
                if(oWndInfo.bShttpIPChannel) {// 私有协议取流
                    szUrl = _FormatString(this.CGI.goPreset.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, (oWndInfo.iChannelID - oDeviceInfo.oStreamCapa.iIpChanBase + 1 + oDeviceInfo.iAnalogChannelNum), options.iPresetID);
                } else {
                    szUrl = _FormatString(this.CGI.goPreset.digital, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID, options.iPresetID);
                }
            }

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.recordSearch = function (oDeviceInfo, options) {
            var szUrl = "",
                szData = "",
                iChannelID = options.iChannelID,
                szStartTime = options.szStartTime.replace(" ", "T") + "Z",
                szEndTime = options.szEndTime.replace(" ", "T") + "Z";

            szUrl = _FormatString(this.CGI.recordSearch, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                "<CMSearchDescription>" +
                "<searchID>" + new UUID() + "</searchID>" +
                "<trackList><trackID>" + (iChannelID * 100 + 1) + "</trackID></trackList>" +
                "<timeSpanList>" +
                "<timeSpan>" +
                "<startTime>" + szStartTime + "</startTime>" +
                "<endTime>" + szEndTime + "</endTime>" +
                "</timeSpan>" +
                "</timeSpanList>" +
                "<maxResults>40</maxResults>" +
                "<searchResultPostion>" + options.iSearchPos + "</searchResultPostion>" +
                "<metadataList>" +
                "<metadataDescriptor>//metadata.ISAPI.org/VideoMotion</metadataDescriptor>" +
                "</metadataList>" +
                "</CMSearchDescription>";

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "POST",
                url: szUrl,
                //async: false,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<CMSearchResult>");
                    arrXml.push("<responseStatus>" + NS.$XML(xmlDoc).find("responseStatus").eq(0).text() + "</responseStatus>");
                    arrXml.push("<responseStatusStrg>" + NS.$XML(xmlDoc).find("responseStatusStrg").eq(0).text() + "</responseStatusStrg>");
                    arrXml.push("<numOfMatches>" + NS.$XML(xmlDoc).find("numOfMatches").eq(0).text() + "</numOfMatches>");
                    arrXml.push("<matchList>");

                    var nodeList = NS.$XML(xmlDoc).find("searchMatchItem", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i];

                        arrXml.push("<searchMatchItem>");

                        arrXml.push("<trackID>" + NS.$XML(node).find("trackID").eq(0).text() + "</trackID>");
                        arrXml.push("<startTime>" + NS.$XML(node).find("startTime").eq(0).text() + "</startTime>");
                        arrXml.push("<endTime>" + NS.$XML(node).find("endTime").eq(0).text() + "</endTime>");
                        arrXml.push("<playbackURI>" + m_utilsInc.escape(NS.$XML(node).find("playbackURI").eq(0).text()) + "</playbackURI>");
                        arrXml.push("<metadataDescriptor>" + NS.$XML(node).find("metadataDescriptor").eq(0).text().split("/")[1] + "</metadataDescriptor>");

                        arrXml.push("</searchMatchItem>");
                    }
                    arrXml.push("</matchList>");
                    arrXml.push("</CMSearchResult>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.startPlayback = function (oDeviceInfo, options) {
            var iWndIndex = options.iWndIndex,
                szStartTime = options.szStartTime,
                szEndTime = options.szEndTime;

            //组成url
            var szUrl = _FormatString(options.cgi, options.urlProtocol, oDeviceInfo.szIP, options.iPort, options.iChannelID, szStartTime, szEndTime);

            //如果用户选择了转码码流，则设置转码码流参数
            if(!_isUndefined(options.oTransCodeParam)) {
                var szTransStreamXml = _generateTransCodeXml(options.oTransCodeParam);
                if(szTransStreamXml == "") {
                    return -1;
                }
                m_pluginOBJECT.HWP_SetTrsPlayBackParam(iWndIndex, szTransStreamXml);
            }

            var iRet = m_pluginOBJECT.HWP_Play(szUrl, oDeviceInfo.szAuth, iWndIndex, szStartTime, szEndTime);
            if(0 == iRet) {
                var wndInfo = new wndInfoClass();
                wndInfo.iIndex = iWndIndex;
                wndInfo.szIP = oDeviceInfo.szIP;
                wndInfo.iChannelID = options.iChannelID;
                wndInfo.iPlayStatus = PLAY_STATUS_PLAYBACK;

                m_wndSet.push(wndInfo);
            }

            return iRet;
        };

        ISAPIProtocol.prototype.reversePlayback = function (oDeviceInfo, options) {
            var iWndIndex = options.iWndIndex,
                szStartTime = options.szStartTime,
                szEndTime = options.szEndTime;

            //组成url
            var szUrl = _FormatString(options.cgi, options.urlProtocol, oDeviceInfo.szIP, options.iPort, options.iChannelID, szStartTime, szEndTime);

            var iRet = m_pluginOBJECT.HWP_ReversePlay(szUrl, oDeviceInfo.szAuth, iWndIndex, szStartTime, szEndTime);
            if(0 == iRet) {
                var wndInfo = new wndInfoClass();
                wndInfo.iIndex = iWndIndex;
                wndInfo.szIP = oDeviceInfo.szIP;
                wndInfo.iChannelID = options.iChannelID;
                wndInfo.iPlayStatus = PLAY_STATUS_REVERSE_PLAYBACK;

                m_wndSet.push(wndInfo);
            }

            return iRet;
        };

        ISAPIProtocol.prototype.startDownloadRecord = function (oDeviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.startDownloadRecord, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            var szDownXml = "<?xml version='1.0' encoding='UTF-8'?>" +
                "<downloadRequest>" +
                "<playbackURI> " + m_utilsInc.escape(options.szPlaybackURI) + "</playbackURI>" +
                "</downloadRequest>";

            return m_pluginOBJECT.HWP_StartDownload(szUrl, oDeviceInfo.szAuth, options.szFileName, szDownXml);
        };

        ISAPIProtocol.prototype.exportDeviceConfig = function (oDeviceInfo) {
            //组成url
            var szUrl = _FormatString(this.CGI.deviceConfig, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            return m_pluginOBJECT.HWP_ExportDeviceConfig(szUrl, oDeviceInfo.szAuth, "", 0);
        };

        ISAPIProtocol.prototype.importDeviceConfig = function (oDeviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.deviceConfig, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            return m_pluginOBJECT.HWP_ImportDeviceConfig(szUrl, oDeviceInfo.szAuth, options.szFileName, 0);
        };

        ISAPIProtocol.prototype.restart = function (oDeviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.restart, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.restore = function (oDeviceInfo, szMode, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.restore, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, szMode);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.startUpgrade = function (oDeviceInfo, options) {
            //组成url
            var szUpgradeURL = _FormatString(this.CGI.startUpgrade.upgrade, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort),
                szStatusURL = _FormatString(this.CGI.startUpgrade.status, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            return m_pluginOBJECT.HWP_StartUpgrade(szUpgradeURL, szStatusURL, oDeviceInfo.szAuth, options.szFileName);
        };

        ISAPIProtocol.prototype.set3DZoom = function (oDeviceInfo, oWndInfo, szZoomInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "";

            //组成url
            if(iChannelID <= oDeviceInfo.iAnalogChannelNum) {
                szUrl = _FormatString(this.CGI.set3DZoom, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
            } else {
                if(oWndInfo.bShttpIPChannel) {// 私有协议取流
                    szUrl = _FormatString(this.CGI.set3DZoom, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, (oWndInfo.iChannelID - oDeviceInfo.oStreamCapa.iIpChanBase + 1 + oDeviceInfo.iAnalogChannelNum));
                } else {
                    szUrl = _FormatString(this.CGI.set3DZoom, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);
                }
            }

            var xmlDoc = m_utilsInc.loadXML(szZoomInfo),
                iTopX = parseInt(NS.$XML(xmlDoc).find("StartPoint").eq(0).find("positionX").eq(0).text(), 10),
                iTopY = parseInt(NS.$XML(xmlDoc).find("StartPoint").eq(0).find("positionY").eq(0).text(), 10),
                iBottomX = parseInt(NS.$XML(xmlDoc).find("EndPoint").eq(0).find("positionX").eq(0).text(), 10),
                iBottomY = parseInt(NS.$XML(xmlDoc).find("EndPoint").eq(0).find("positionY").eq(0).text(), 10);

            var szXml = "<?xml version='1.0' encoding='UTF-8'?>" +
                "<position3D>" +
                "<StartPoint>" +
                "<positionX>" + iTopX + "</positionX>" +
                "<positionY>" + (255 - iTopY) + "</positionY>" +
                "</StartPoint>" +
                "<EndPoint>" +
                "<positionX>" + iBottomX + "</positionX>" +
                "<positionY>" + (255 - iBottomY) + "</positionY>" +
                "</EndPoint>" +
                "</position3D>";

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                data: szXml,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        ISAPIProtocol.prototype.getSDKCapa = function (deviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.SDKCapabilities, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: szUrl,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        /*********************************ISAPI协议类 end*********************************/


        /*********************************PSIA协议类 start*********************************/
        var PSIAProtocol = function () {
        };

        //PSIAProtocol new出来的对象都公用一个CGI协议，只是具体的参数不同
        PSIAProtocol.prototype.CGI = {
            login: "%s%s:%s/PSIA/Custom/SelfExt/userCheck",
            getAudioInfo: "%s%s:%s/PSIA/Custom/SelfExt/TwoWayAudio/channels",
            getDeviceInfo: "%s%s:%s/PSIA/System/deviceInfo",
            getAnalogChannelInfo: "%s%s:%s/PSIA/System/Video/inputs/channels",
			getDigitalChannel: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/DynVideo/inputs/channels",
            getDigitalChannelInfo: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/DynVideo/inputs/channels/status",
            getZeroChannelInfo: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/ZeroVideo/channels",
            getStreamChannels: {
                analog: "%s%s:%s/PSIA/Streaming/channels",
                digital: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/DynStreaming/channels"
            },
            getStreamDynChannels: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/DynStreaming/channels",
            startRealPlay: {
                channels: "%s%s:%s/PSIA/streaming/channels/%s",
                zeroChannels: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/ZeroStreaming/channels/%s"
            },
            startVoiceTalk: {
                open: "%s%s:%s/PSIA/Custom/SelfExt/TwoWayAudio/channels/%s/open",
                close: "%s%s:%s/PSIA/Custom/SelfExt/TwoWayAudio/channels/%s/close",
                audioData: "%s%s:%s/PSIA/Custom/SelfExt/TwoWayAudio/channels/%s/audioData"
            },
            ptzControl: "%s%s:%s/PSIA/PTZ/channels/%s/continuous",
            ptzAutoControl: "%s%s:%s/PSIA/Custom/SelfExt/PTZ/channels/%s/autoptz",
            setPreset: "%s%s:%s/PSIA/PTZ/channels/%s/presets/%s",
            goPreset: "%s%s:%s/PSIA/PTZ/channels/%s/presets/%s/goto",
            //focus
            ptzFocus: "%s%s:%s/PSIA/System/Video/inputs/channels/%s/focus",
            //Iris
            ptzIris: "%s%s:%s/PSIA/System/Video/inputs/channels/%s/iris",
            //网络相关，不暴露给客户，只是为了自己用
            getNetworkBond: "%s%s:%s/PSIA/Custom/SelfExt/Bond",
            getNetworkInterface: "%s%s:%s/PSIA/System/Network/interfaces",
            getUPnPPortStatus: "%s%s:%s/PSIA/Custom/SelfExt/UPnP/ports/status",
            getPPPoEStatus: "%s%s:%s/PSIA/Custom/SelfExt/PPPoE/1/status",
            getPortInfo: "%s%s:%s/PSIA/Security/AAA/adminAccesses",
            recordSearch: "%s%s:%s/PSIA/ContentMgmt/search",
            startPlayback: "%s%s:%s/PSIA/streaming/tracks/%s?starttime=%s&endtime=%s",
            startDownloadRecord: "%s%s:%s/PSIA/Custom/SelfExt/ContentMgmt/download",
            deviceConfig: "%s%s:%s/PSIA/System/configurationData",
            restart: "%s%s:%s/PSIA/System/reboot",
            restore: "%s%s:%s/PSIA/System/factoryReset?mode=%s",
            startUpgrade: {
                upgrade: "%s%s:%s/PSIA/System/updateFirmware",
                status: "%s%s:%s/PSIA/Custom/SelfExt/upgradeStatus"
            },
            set3DZoom: "%s%s:%s/PSIA/Custom/SelfExt/PTZ/channels/%s/Set3DZoom"
        };

        PSIAProtocol.prototype.login = function (szIP, iPort, szAuth, options) {
            //组成url
            var szProtocol = options.protocol == 2 ? "https://" : "http://";
            var url = _FormatString(this.CGI.login, szProtocol, szIP, iPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if("200" == NS.$XML(xmlDoc).find("statusValue").eq(0).text()) {
                        if(options.success) {
                            options.success(xmlDoc);
                        }
                    } else {
                        if(options.error) {
                            options.error(401, xmlDoc);
                        }
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getAudioInfo = function (deviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.getAudioInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: szUrl,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getDeviceInfo = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getDeviceInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<DeviceInfo>");
                    arrXml.push("<deviceName>" + m_utilsInc.escape(NS.$XML(xmlDoc).find("deviceName").eq(0).text()) + "</deviceName>");
                    arrXml.push("<deviceID>" + NS.$XML(xmlDoc).find("deviceID").eq(0).text() + "</deviceID>");
                    arrXml.push("<deviceType>" + NS.$XML(xmlDoc).find("deviceDescription").eq(0).text() + "</deviceType>");
                    arrXml.push("<model>" + NS.$XML(xmlDoc).find("model").eq(0).text() + "</model>");
                    arrXml.push("<serialNumber>" + NS.$XML(xmlDoc).find("serialNumber").eq(0).text() + "</serialNumber>");
                    arrXml.push("<macAddress>" + NS.$XML(xmlDoc).find("macAddress").eq(0).text() + "</macAddress>");
                    arrXml.push("<firmwareVersion>" + NS.$XML(xmlDoc).find("firmwareVersion").eq(0).text() + "</firmwareVersion>");
                    arrXml.push("<firmwareReleasedDate>" + NS.$XML(xmlDoc).find("firmwareReleasedDate").eq(0).text() + "</firmwareReleasedDate>");
                    arrXml.push("<encoderVersion>" + NS.$XML(xmlDoc).find("logicVersion").eq(0).text() + "</encoderVersion>");
                    arrXml.push("<encoderReleasedDate>" + NS.$XML(xmlDoc).find("logicReleasedDate").eq(0).text() + "</encoderReleasedDate>");
                    arrXml.push("</DeviceInfo>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            //发送请求
            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();
        };

        PSIAProtocol.prototype.getAnalogChannelInfo = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getAnalogChannelInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<VideoInputChannelList>");

                    var nodeList = NS.$XML(xmlDoc).find("VideoInputChannel", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i];

                        arrXml.push("<VideoInputChannel>");
                        arrXml.push("<id>" + NS.$XML(node).find("id").eq(0).text() + "</id>");
                        arrXml.push("<inputPort>" + NS.$XML(node).find("inputPort").eq(0).text() + "</inputPort>");
                        //arrXml.push("<videoInputEnabled>" + NS.$XML(node).find("videoInputEnabled").eq(0).text() + "</videoInputEnabled>");IPC没有这个节点
                        arrXml.push("<name>" + m_utilsInc.escape(NS.$XML(node).find("name").eq(0).text()) + "</name>");
                        arrXml.push("<videoFormat>" + NS.$XML(node).find("videoFormat").eq(0).text() + "</videoFormat>");
                        arrXml.push("</VideoInputChannel>");
                    }
                    arrXml.push("</VideoInputChannelList>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

		PSIAProtocol.prototype.getDigitalChannel = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getDigitalChannel, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
					arrXml.push("<InputProxyChannelList>");

					var nodeList = NS.$XML(xmlDoc).find("DynVideoInputChannel", true);
					for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
						var node = nodeList[i];

						arrXml.push("<InputProxyChannel>");
						arrXml.push("<id>" + NS.$XML(node).find("id").eq(0).text() + "</id>");
						arrXml.push("<name>" + m_utilsInc.escape(NS.$XML(node).find("name").eq(0).text()) + "</name>");
						arrXml.push("</InputProxyChannel>");
					}
					arrXml.push("</InputProxyChannelList>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getDigitalChannelInfo = function (deviceInfo, options) {
			// 获取数字通道的名称，需要单独发送协议获取
			var oDigitalChannelXML = null,
				oDigitalChannelName = {};
			this.getDigitalChannel(deviceInfo, {
				async: false,
				success: function (xmlDoc) {
					oDigitalChannelXML = xmlDoc;

					var nodeList = NS.$XML(oDigitalChannelXML).find("InputProxyChannel", true);
					for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
						var node = nodeList[i],
							szId = NS.$XML(node).find("id").eq(0).text(),
							szName = NS.$XML(node).find("name").eq(0).text();

						oDigitalChannelName[szId] = szName;
					}
				},
				error: function (httpStatus, xmlDoc) {
					if (options.error) {
						options.error(httpStatus, xmlDoc);
					}
				}
			});
			if (null === oDigitalChannelXML) {// 请求出错，后面的请求不发送了
				return;
			}

            //组成url
            var url = _FormatString(this.CGI.getDigitalChannelInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<InputProxyChannelStatusList>");

                    var nodeList = NS.$XML(xmlDoc).find("DynVideoInputChannelStatus", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i],
							szId = NS.$XML(node).find("id").eq(0).text();

                        arrXml.push("<InputProxyChannelStatus>");
                        arrXml.push("<id>" + szId + "</id>");
                        arrXml.push("<sourceInputPortDescriptor>");
                        arrXml.push("<proxyProtocol>" + NS.$XML(node).find("adminProtocol").eq(0).text() + "</proxyProtocol>");
                        arrXml.push("<addressingFormatType>" + NS.$XML(node).find("addressingFormatType").eq(0).text() + "</addressingFormatType>");
                        arrXml.push("<ipAddress>" + NS.$XML(node).find("ipAddress").eq(0).text() + "</ipAddress>");
                        arrXml.push("<managePortNo>" + NS.$XML(node).find("adminPortNo").eq(0).text() + "</managePortNo>");
                        arrXml.push("<srcInputPort>" + NS.$XML(node).find("srcInputPort").eq(0).text() + "</srcInputPort>");
                        arrXml.push("<userName>" + m_utilsInc.escape(NS.$XML(node).find("userName").eq(0).text()) + "</userName>");
                        arrXml.push("<streamType>" + NS.$XML(node).find("streamType").eq(0).text() + "</streamType>");
                        arrXml.push("<online>" + NS.$XML(node).find("online").eq(0).text() + "</online>");
						arrXml.push("<name>" + m_utilsInc.escape(oDigitalChannelName[szId]) + "</name>");
                        arrXml.push("</sourceInputPortDescriptor>");
                        arrXml.push("</InputProxyChannelStatus>");
                    }
                    arrXml.push("</InputProxyChannelStatusList>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getZeroChannelInfo = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getZeroChannelInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        //协议内容一样，不需要兼容
        PSIAProtocol.prototype.getPPPoEStatus = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getPPPoEStatus, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getUPnPPortStatus = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getUPnPPortStatus, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getNetworkBond = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getNetworkBond, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getNetworkInterface = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getNetworkInterface, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容，不需要兼容，直接返回给上层即可
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getPortInfo = function (deviceInfo, options) {
            var url = _FormatString(this.CGI.getPortInfo, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<AdminAccessProtocolList>");

                    var nodeList = NS.$XML(xmlDoc).find("AdminAccessProtocol", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i];

                        arrXml.push("<AdminAccessProtocol>");
                        arrXml.push("<id>" + NS.$XML(xmlDoc).find("id").eq(0).text() + "</id>");
                        arrXml.push("<enabled>" + NS.$XML(xmlDoc).find("enabled").eq(0).text() + "</enabled>");
                        arrXml.push("<protocol>" + NS.$XML(xmlDoc).find("protocol").eq(0).text().toUpperCase() + "</protocol>");
                        arrXml.push("<portNo>" + NS.$XML(xmlDoc).find("portNo").eq(0).text() + "</portNo>");
                        arrXml.push("</AdminAccessProtocol>");
                    }
                    //要接着获取rtsp端口
                    m_PSIAProtocol.getStreamChannels(deviceInfo, {
                        async: false,
                        success: function (xmlDoc) {
                            if(NS.$XML(xmlDoc).find("rtspPortNo", true).length > 0) {
                                var iRtpsPort = parseInt(NS.$XML(xmlDoc).find("rtspPortNo").eq(0).text(), 10);
                                arrXml.push("<AdminAccessProtocol>");
                                arrXml.push("<id>" + 4 + "</id>");
                                arrXml.push("<enabled>" + "true" + "</enabled>");
                                arrXml.push("<protocol>" + "RTSP" + "</protocol>");
                                arrXml.push("<portNo>" + iRtpsPort + "</portNo>");
                                arrXml.push("</AdminAccessProtocol>");

                                arrXml.push("</AdminAccessProtocolList>");

                                var userXmlDoc = m_utilsInc.loadXML(arrXml.join(""));
                                if(options.success) {
                                    options.success(userXmlDoc);  //调用上层回调函数
                                }
                            } else {
                                m_PSIAProtocol.getStreamDynChannels(deviceInfo, {
                                    async: false,
                                    success: function (xmlDoc) {
                                        if(NS.$XML(xmlDoc).find("rtspPortNo", true).length > 0) {
                                            var iRtpsPort = parseInt(NS.$XML(xmlDoc).find("rtspPortNo").eq(0).text(), 10);
                                            arrXml.push("<AdminAccessProtocol>");
                                            arrXml.push("<id>" + 4 + "</id>");
                                            arrXml.push("<enabled>" + "true" + "</enabled>");
                                            arrXml.push("<protocol>" + "RTSP" + "</protocol>");
                                            arrXml.push("<portNo>" + iRtpsPort + "</portNo>");
                                            arrXml.push("</AdminAccessProtocol>");

                                            arrXml.push("</AdminAccessProtocolList>");

                                            var userXmlDoc = m_utilsInc.loadXML(arrXml.join(""));
                                            if(options.success) {
                                                options.success(userXmlDoc);  //调用上层回调函数
                                            }
                                        }
                                    },
                                    error: function () {
                                        //走到这表示网络可能有问题
                                        if(options.error) {
                                            options.error();
                                        }
                                    }
                                });
                            }
                        },
                        error: function () {
                            //走到这表示网络可能有问题
                            if(options.error) {
                                options.error();
                            }
                        }
                    });
                },
                error: function () {
                    //PSIA一些老设备可能不支持/PSIA/Security/AAA/adminAccesses
                    var arrXml = [];
                    arrXml.push("<AdminAccessProtocolList>");
                    m_PSIAProtocol.getStreamChannels(deviceInfo, {
                        async: false,
                        success: function (xmlDoc) {
                            if(NS.$XML(xmlDoc).find("rtspPortNo", true).length > 0) {
                                var iRtpsPort = parseInt(NS.$XML(xmlDoc).find("rtspPortNo").eq(0).text(), 10);
                                arrXml.push("<AdminAccessProtocol>");
                                arrXml.push("<id>" + 4 + "</id>");
                                arrXml.push("<enabled>" + "true" + "</enabled>");
                                arrXml.push("<protocol>" + "RTSP" + "</protocol>");
                                arrXml.push("<portNo>" + iRtpsPort + "</portNo>");
                                arrXml.push("</AdminAccessProtocol>");

                                arrXml.push("</AdminAccessProtocolList>");

                                var userXmlDoc = m_utilsInc.loadXML(arrXml.join(""));
                                if(options.success) {
                                    options.success(userXmlDoc);  //调用上层回调函数
                                }
                            } else {
                                m_PSIAProtocol.getStreamDynChannels(deviceInfo, {
                                    async: false,
                                    success: function (xmlDoc) {
                                        if(NS.$XML(xmlDoc).find("rtspPortNo", true).length > 0) {
                                            var iRtpsPort = parseInt(NS.$XML(xmlDoc).find("rtspPortNo").eq(0).text(), 10);
                                            arrXml.push("<AdminAccessProtocol>");
                                            arrXml.push("<id>" + 4 + "</id>");
                                            arrXml.push("<enabled>" + "true" + "</enabled>");
                                            arrXml.push("<protocol>" + "RTSP" + "</protocol>");
                                            arrXml.push("<portNo>" + iRtpsPort + "</portNo>");
                                            arrXml.push("</AdminAccessProtocol>");

                                            arrXml.push("</AdminAccessProtocolList>");

                                            var userXmlDoc = m_utilsInc.loadXML(arrXml.join(""));
                                            if(options.success) {
                                                options.success(userXmlDoc);  //调用上层回调函数
                                            }
                                        }
                                    },
                                    error: function () {
                                        //走到这表示网络可能有问题
                                        if(options.error) {
                                            options.error();
                                        }
                                    }
                                });
                            }
                        },
                        error: function () {
                            //走到这表示网络可能有问题
                            if(options.error) {
                                options.error();
                            }
                        }
                    });
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getStreamChannels = function (deviceInfo, options) {
            //组成url
            if(deviceInfo.iAnalogChannelNum != 0) {
                var url = _FormatString(this.CGI.getStreamChannels.analog, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);
            } else {
                var url = _FormatString(this.CGI.getStreamChannels.digital, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);
            }

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.getStreamDynChannels = function (deviceInfo, options) {
            //组成url
            var url = _FormatString(this.CGI.getStreamDynChannels, deviceInfo.szHttpProtocol, deviceInfo.szIP, deviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "GET",
                url: url,
                auth: deviceInfo.szAuth,
                success: null,
                error: null
            };

            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.startRealPlay = function (oDeviceInfo, options) {
            var iChannelID = options.iChannelID * 100 + options.iStreamType,
                szUrl = "";

            //组成url
            if(options.bZeroChannel) {
                szUrl = _FormatString(options.cgi.zeroChannels, options.urlProtocol, oDeviceInfo.szIP, options.iPort, iChannelID);
            } else {
                szUrl = _FormatString(options.cgi.channels, options.urlProtocol, oDeviceInfo.szIP, options.iPort, iChannelID);
            }

            var iRet = m_pluginOBJECT.HWP_Play(szUrl, oDeviceInfo.szAuth, options.iWndIndex, "", "");
            if(0 == iRet) {
                var wndInfo = new wndInfoClass();
                wndInfo.iIndex = options.iWndIndex;
                wndInfo.szIP = oDeviceInfo.szIP;
                wndInfo.iChannelID = options.iChannelID;
                wndInfo.iPlayStatus = PLAY_STATUS_REALPLAY;

                m_wndSet.push(wndInfo);
            }

            return iRet;
        };

        PSIAProtocol.prototype.startVoiceTalk = function (oDeviceInfo, iAudioChannel) {
            //组成url
            var szOpenUrl = _FormatString(this.CGI.startVoiceTalk.open, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iAudioChannel),
                szCloseUrl = _FormatString(this.CGI.startVoiceTalk.close, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iAudioChannel),
                szAudioDataUrl = _FormatString(this.CGI.startVoiceTalk.audioData, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iAudioChannel);

            var iRet = m_pluginOBJECT.HWP_StartVoiceTalk(szOpenUrl, szCloseUrl, szAudioDataUrl, oDeviceInfo.szAuth, oDeviceInfo.iAudioType);

            return iRet;
        };

        PSIAProtocol.prototype.ptzAutoControl = function (oDeviceInfo, bStop, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "",
                szData = "";

            options.iPTZSpeed = options.iPTZSpeed < 7 ? options.iPTZSpeed * 15 : 100;
            if(bStop) {
                //如果要停止自转，速度强制为0
                options.iPTZSpeed = 0;
            }
            if(oDeviceInfo.szDeviceType != DEVICE_TYPE_IPDOME) {
                szUrl = _FormatString(this.CGI.ptzAutoControl, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iChannelID);
                szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                    "<PTZData>" +
                    "<pan>" + options.iPTZSpeed + "</pan>" +
                    "<tilt>0</tilt>" +
                    "</PTZData>";
            } else {
                //IPDome
                var iPresetID = 99;
                if(bStop) {
                    iPresetID = 96;
                }
                szUrl = _FormatString(this.CGI.goPreset, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, iChannelID, iPresetID);
            }

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                async: false,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            var self = this;
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    oWndInfo.bPTZAuto = !oWndInfo.bPTZAuto;
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(oDeviceInfo.szDeviceType != DEVICE_TYPE_IPDOME) {
                        //PSIA版本可能失败，需要调用另外一条URL，IPC和后端都相同
                        szUrl = _FormatString(self.CGI.ptzControl, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);

                        //设置请求属性
                        var httpClient = new HttpPluginClient();

                        var newOptions = {
                            type: "PUT",
                            url: szUrl,
                            async: false,
                            auth: oDeviceInfo.szAuth,
                            data: szData,
                            success: null,
                            error: null
                        };

                        m_utilsInc.extend(newOptions, options);
                        httpClient.setRequestParam(newOptions);
                        httpClient.submitRequest();//发送请求
                    } else {
                        //球机如果自动出错，则直接返回出错
                        if(options.error) {
                            options.error(httpStatus, xmlDoc);
                        }
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.ptzControl = function (oDeviceInfo, bStop, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "";

            if(oWndInfo.bPTZAuto) {
                this.ptzAutoControl(oDeviceInfo, true, oWndInfo, {iPTZSpeed: 0});
            }

            if(bStop) {
                options.iPTZSpeed = 0;
            } else {
                options.iPTZSpeed = options.iPTZSpeed < 7 ? options.iPTZSpeed * 15 : 100;
            }

            var oDirection = [
                {},
                {pan: 0, tilt: options.iPTZSpeed}, // 上
                {pan: 0, tilt: -options.iPTZSpeed}, // 下
                {pan: -options.iPTZSpeed, tilt: 0}, // 左
                {pan: options.iPTZSpeed, tilt: 0}, // 右
                {pan: -options.iPTZSpeed, tilt: options.iPTZSpeed},	// 左上
                {pan: -options.iPTZSpeed, tilt: -options.iPTZSpeed}, // 左下
                {pan: options.iPTZSpeed, tilt: options.iPTZSpeed}, // 右上
                {pan: options.iPTZSpeed, tilt: -options.iPTZSpeed}, // 右下
                {}, //PTZ自动，由其它接口实现，此处不处理
                {speed: options.iPTZSpeed},//zoomin
                {speed: -options.iPTZSpeed}, //zoomout
                {speed: options.iPTZSpeed}, //focusin
                {speed: -options.iPTZSpeed}, //focusout
                {speed: options.iPTZSpeed},  //Irisin
                {speed: -options.iPTZSpeed}   //Irisout
            ];

            var szData = "";
            var oCommond = {};

            switch (options.iPTZIndex) {
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                    //方向命令
                    oCommond = this.CGI.ptzControl;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<PTZData>" +
                        "<pan>" + oDirection[options.iPTZIndex].pan + "</pan>" +
                        "<tilt>" + oDirection[options.iPTZIndex].tilt + "</tilt>" +
                        "</PTZData>";
                    break;
                case 10:
                case 11:
                    //Zoom命令
                    oCommond = this.CGI.ptzControl;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<PTZData>" +
                        "<zoom>" + oDirection[options.iPTZIndex].speed + "</zoom>" +
                        "</PTZData>";
                    break;
                case 12:
                case 13:
                    //focus命令
                    oCommond = this.CGI.ptzFocus;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<FocusData>" +
                        "<focus>" + oDirection[options.iPTZIndex].speed + "</focus>" +
                        "</FocusData>";
                    break;
                case 14:
                case 15:
                    //Iris命令
                    oCommond = this.CGI.ptzIris;
                    szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                        "<IrisData>" +
                        "<iris>" + oDirection[options.iPTZIndex].speed + "</iris>" +
                        "</IrisData>";
                    break;
                default :
                    if(_isUndefined(options.error)) {
                        options.error();
                    }
                    return;
            }

            szUrl = _FormatString(oCommond, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);


            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                async: false,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.setPreset = function (oDeviceInfo, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "",
                szData = "";

            szUrl = _FormatString(this.CGI.setPreset, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID, options.iPresetID);

            szData = "<?xml version='1.0' encoding='UTF-8'?>";
            szData += "<PTZPreset>";
            szData += "<id>" + options.iPresetID + "</id>";
            if(oDeviceInfo.szDeviceType != DEVICE_TYPE_IPDOME) {
                szData += "<presetName>" + "Preset" + options.iPresetID + "</presetName>";
            }
            szData += "</PTZPreset>";

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.goPreset = function (oDeviceInfo, oWndInfo, options) {
            var iChannelID = oWndInfo.iChannelID,
                szUrl = "";

            szUrl = _FormatString(this.CGI.goPreset, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID, options.iPresetID);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.recordSearch = function (oDeviceInfo, options) {
            var szUrl = "",
                szData = "",
                iChannelID = options.iChannelID,
                szStartTime = options.szStartTime.replace(" ", "T") + "Z",
                szEndTime = options.szEndTime.replace(" ", "T") + "Z";

            szUrl = _FormatString(this.CGI.recordSearch, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            szData = "<?xml version='1.0' encoding='UTF-8'?>" +
                "<CMSearchDescription>" +
                "<searchID>" + new UUID() + "</searchID>" +
                "<trackList><trackID>" + (iChannelID * 100 + 1) + "</trackID></trackList>" +
                "<timeSpanList>" +
                "<timeSpan>" +
                "<startTime>" + szStartTime + "</startTime>" +
                "<endTime>" + szEndTime + "</endTime>" +
                "</timeSpan>" +
                "</timeSpanList>" +
                "<maxResults>40</maxResults>" +
                "<searchResultPostion>" + options.iSearchPos + "</searchResultPostion>" +
                "<metadataList>" +
                "<metadataDescriptor>//metadata.psia.org/VideoMotion</metadataDescriptor>" +
                "</metadataList>" +
                "</CMSearchDescription>";

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "POST",
                url: szUrl,
                //async: false,
                auth: oDeviceInfo.szAuth,
                data: szData,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    var arrXml = [];
                    arrXml.push("<CMSearchResult>");
                    arrXml.push("<responseStatus>" + NS.$XML(xmlDoc).find("responseStatus").eq(0).text() + "</responseStatus>");
                    arrXml.push("<responseStatusStrg>" + NS.$XML(xmlDoc).find("responseStatusStrg").eq(0).text() + "</responseStatusStrg>");
                    arrXml.push("<numOfMatches>" + NS.$XML(xmlDoc).find("numOfMatches").eq(0).text() + "</numOfMatches>");
                    arrXml.push("<matchList>");

                    var nodeList = NS.$XML(xmlDoc).find("searchMatchItem", true);
                    for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
                        var node = nodeList[i];

                        arrXml.push("<searchMatchItem>");

                        arrXml.push("<trackID>" + NS.$XML(node).find("trackID").eq(0).text() + "</trackID>");
                        arrXml.push("<startTime>" + NS.$XML(node).find("startTime").eq(0).text() + "</startTime>");
                        arrXml.push("<endTime>" + NS.$XML(node).find("endTime").eq(0).text() + "</endTime>");
                        arrXml.push("<playbackURI>" + m_utilsInc.escape(NS.$XML(node).find("playbackURI").eq(0).text()) + "</playbackURI>");
                        arrXml.push("<metadataDescriptor>" + NS.$XML(node).find("metadataDescriptor").eq(0).text().split("/")[1] + "</metadataDescriptor>");

                        arrXml.push("</searchMatchItem>");
                    }
                    arrXml.push("</matchList>");
                    arrXml.push("</CMSearchResult>");

                    xmlDoc = m_utilsInc.loadXML(arrXml.join(""));

                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.startPlayback = function (oDeviceInfo, options) {
            var iWndIndex = options.iWndIndex,
                szStartTime = options.szStartTime,
                szEndTime = options.szEndTime;

            //组成url
            var szUrl = _FormatString(options.cgi, options.urlProtocol, oDeviceInfo.szIP, options.iPort, options.iChannelID, szStartTime, szEndTime);

            var iRet = m_pluginOBJECT.HWP_Play(szUrl, oDeviceInfo.szAuth, iWndIndex, szStartTime, szEndTime);
            if(0 == iRet) {
                var wndInfo = new wndInfoClass();
                wndInfo.iIndex = iWndIndex;
                wndInfo.szIP = oDeviceInfo.szIP;
                wndInfo.iChannelID = options.iChannelID;
                wndInfo.iPlayStatus = PLAY_STATUS_PLAYBACK;

                m_wndSet.push(wndInfo);
            }

            return iRet;
        };

        PSIAProtocol.prototype.reversePlayback = function (oDeviceInfo, options) {
            var iWndIndex = options.iWndIndex,
                szStartTime = options.szStartTime,
                szEndTime = options.szEndTime;

            //组成url
            var szUrl = _FormatString(options.cgi, options.urlProtocol, oDeviceInfo.szIP, options.iPort, options.iChannelID, szStartTime, szEndTime);

            var iRet = m_pluginOBJECT.HWP_ReversePlay(szUrl, oDeviceInfo.szAuth, iWndIndex, szStartTime, szEndTime);
            if(0 == iRet) {
                var wndInfo = new wndInfoClass();
                wndInfo.iIndex = iWndIndex;
                wndInfo.szIP = oDeviceInfo.szIP;
                wndInfo.iChannelID = options.iChannelID;
                wndInfo.iPlayStatus = PLAY_STATUS_REVERSE_PLAYBACK;

                m_wndSet.push(wndInfo);
            }

            return iRet;
        };

        PSIAProtocol.prototype.startDownloadRecord = function (oDeviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.startDownloadRecord, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            var szDownXml = "<?xml version='1.0' encoding='UTF-8'?>" +
                "<downloadRequest>" +
                "<playbackURI> " + m_utilsInc.escape(options.szPlaybackURI) + "</playbackURI>" +
                "</downloadRequest>";

            return m_pluginOBJECT.HWP_StartDownload(szUrl, oDeviceInfo.szAuth, options.szFileName, szDownXml);
        };

        PSIAProtocol.prototype.exportDeviceConfig = function (oDeviceInfo) {
            //组成url
            var szUrl = _FormatString(this.CGI.deviceConfig, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            return m_pluginOBJECT.HWP_ExportDeviceConfig(szUrl, oDeviceInfo.szAuth, "", 0);
        };

        PSIAProtocol.prototype.importDeviceConfig = function (oDeviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.deviceConfig, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            return m_pluginOBJECT.HWP_ImportDeviceConfig(szUrl, oDeviceInfo.szAuth, options.szFileName, 0);
        };

        PSIAProtocol.prototype.restart = function (oDeviceInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.restart, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.restore = function (oDeviceInfo, szMode, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.restore, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, szMode);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        PSIAProtocol.prototype.startUpgrade = function (oDeviceInfo, options) {
            //组成url
            var szUpgradeURL = _FormatString(this.CGI.startUpgrade.upgrade, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort),
                szStatusURL = _FormatString(this.CGI.startUpgrade.status, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort);

            return m_pluginOBJECT.HWP_StartUpgrade(szUpgradeURL, szStatusURL, oDeviceInfo.szAuth, options.szFileName);
        };

        PSIAProtocol.prototype.set3DZoom = function (oDeviceInfo, oWndInfo, szZoomInfo, options) {
            //组成url
            var szUrl = _FormatString(this.CGI.set3DZoom, oDeviceInfo.szHttpProtocol, oDeviceInfo.szIP, oDeviceInfo.iCGIPort, oWndInfo.iChannelID);

            //设置请求属性
            var httpClient = new HttpPluginClient();

            var newOptions = {
                type: "PUT",
                url: szUrl,
                data: szZoomInfo,
                auth: oDeviceInfo.szAuth,
                success: null,
                error: null
            };

            //数据兼容
            m_utilsInc.extend(newOptions, options);
            m_utilsInc.extend(newOptions, {
                success: function (xmlDoc) {
                    if(options.success) {
                        options.success(xmlDoc);
                    }
                },
                error: function (httpStatus, xmlDoc) {
                    if(options.error) {
                        options.error(httpStatus, xmlDoc);
                    }
                }
            });

            httpClient.setRequestParam(newOptions);
            httpClient.submitRequest();//发送请求
        };

        /*********************************PSIA协议类 end*********************************/


        /*********************************工具模块 start*********************************/
        var System = function () {
            //this.bDebug = false;
        };

        System.prototype._alert = function (str) {
            if(m_options.bDebugMode) {
                console.log(str);
            }
        };
        /*********************************工具模块 end************************************/

        /*********************************XML解析类 start*********************************/
        /**
         * XML Parse Class
         */

        (function (wvc) {
            var XML = function (xd) {
                this.elems = [];
                this.length = 0;

                this.length = this.elems.push(xd);
            };

            XML.prototype.find = function (szNodeName, bRet) {
                var oXmlNode = this.elems[this.length - 1].getElementsByTagName(szNodeName);
                this.length = this.elems.push(oXmlNode);
                if(bRet) {
                    return oXmlNode;
                } else {
                    return this;
                }
            };

            XML.prototype.eq = function (i, bRet) {
                var iLen = this.elems[this.length - 1].length,
                    oXmlNode = null;
                if(iLen > 0 && i < iLen) {
                    oXmlNode = this.elems[this.length - 1][i];
                }
                this.length = this.elems.push(oXmlNode);
                if(bRet) {
                    return oXmlNode;
                } else {
                    return this;
                }
            };

            XML.prototype.text = function (szText) {
                if(this.elems[this.length - 1]) {
                    if(szText) {
                        if(window.DOMParser) {
                            this.elems[this.length - 1].textContent = szText;
                        } else {
                            this.elems[this.length - 1].text = szText;
                        }
                    } else {
                        if(window.DOMParser) {
                            return this.elems[this.length - 1].textContent;
                        } else {
                            return this.elems[this.length - 1].text;
                        }
                    }
                } else {
                    return "";
                }
            };

            XML.prototype.attr = function (szAttrName) {
                if(this.elems[this.length - 1]) {
                    var oAttr = this.elems[this.length - 1].attributes.getNamedItem(szAttrName);
                    if(oAttr) {
                        return oAttr.value;
                    } else {
                        return "";
                    }
                }
            };

            wvc.$XML = function (xd) {
                return new XML(xd);
            };

        })(this);
        /*********************************XML解析类 end*********************************/

        /*********************************Utils工具类 start*****************************/
        /**
         * Utils Class
         */

        var Utils = function () {

        };

        Utils.prototype.extend = function () {
            var target = arguments[0] || {},
                i = 1,
                length = arguments.length,
                options;

            for (; i < length; i++) {
                if((options = arguments[i]) != null) {
                    for (var name in options) {
                        var src = target[name],
                            copy = options[name];
                        if(target === copy) {
                            continue;
                        }
                        if("object" == typeof copy) {
                            target[name] = this.extend({}, copy);
                        } else if(copy !== undefined) {
                            target[name] = copy;
                        }
                    }
                }
            }
            return target;
        };

        Utils.prototype.browser = function () {
            //var rwebkit = /(webkit)[ \/]([\w.]+)/;
            var rchrome = /(chrome)[ \/]([\w.]+)/;// chrome中存在safari字样，需先放在rsafari正则前处理，否则chrome会被识别成safari
            var rsafari = /(safari)[ \/]([\w.]+)/;
            var ropera = /(opera)(?:.*version)?[ \/]([\w.]+)/;
            var rmsie = /(msie) ([\w.]+)/;
            var rmsie2 = /(trident.*rv:)([\w.]+)/;// IE11
            var rmozilla = /(mozilla)(?:.*? rv:([\w.]+))?/;// mozilla放最后，其他浏览器都存在mozilla字样

            var ua = navigator.userAgent.toLowerCase();

            var match = rchrome.exec(ua) ||
                rsafari.exec(ua) ||
                ropera.exec(ua) ||
                rmsie.exec(ua) ||
                rmsie2.exec(ua) ||// IE11
                ua.indexOf("compatible") < 0 && rmozilla.exec(ua) ||
                ["unknow", "0"];

            if(match.length > 0 && match[1].indexOf("trident") > -1) {// IE11
                match[1] = "msie";
            }

            /*if("webkit" == match[1]) {// Chrome Safari
                if(ua.indexOf("chrome") > -1) {
                    match[1] = "chrome";
                } else {
                    match[1] = "safari";
                }
            }*/

            var oBrowser = {};
            oBrowser[match[1]] = true;
            oBrowser.version = match[2];

            return oBrowser;
        };

        Utils.prototype.loadXML = function (szXml) {
            if(null == szXml || "" == szXml) {
                return null;
            }

            var oXmlDoc = null;

            if(window.DOMParser) {
                var oParser = new DOMParser();
                oXmlDoc = oParser.parseFromString(szXml, "text/xml");
            } else {
                oXmlDoc = new ActiveXObject("Microsoft.XMLDOM");
                oXmlDoc.async = false;
                oXmlDoc.loadXML(szXml);
            }

            return oXmlDoc;
        };

        Utils.prototype.toXMLStr = function (oXmlDoc) {
            var szXmlDoc = "";

            try {
                var oSerializer = new XMLSerializer();
                szXmlDoc = oSerializer.serializeToString(oXmlDoc);
            } catch (e) {
                try {
                    szXmlDoc = oXmlDoc.xml;
                } catch (e) {
                    return "";
                }
            }
            if(szXmlDoc.indexOf("<?xml") == -1) {
                szXmlDoc = "<?xml version='1.0' encoding='utf-8'?>" + szXmlDoc;
            }

            return szXmlDoc;
        };

        Utils.prototype.escape = function (szStr) {
            return szStr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };

        Utils.prototype.dateFormat = function (oDate, fmt) {
            var o = {
                "M+": oDate.getMonth() + 1, //月份
                "d+": oDate.getDate(), //日
                "h+": oDate.getHours(), //小时
                "m+": oDate.getMinutes(), //分
                "s+": oDate.getSeconds(), //秒
                "q+": Math.floor((oDate.getMonth() + 3) / 3), //季度
                "S": oDate.getMilliseconds()//毫秒
            };
            if(/(y+)/.test(fmt)) {
                fmt = fmt.replace(RegExp.$1, (oDate.getFullYear() + "").substr(4 - RegExp.$1.length));
            }
            for (var k in o) {
                if(new RegExp("(" + k + ")").test(fmt)) {
                    fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
                }
            }
            return fmt;
        };

        Utils.prototype.Base64 = {
            // private property
            _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
            // public method for encoding
            encode: function (input) {
                var output = "";
                var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
                var i = 0;
                input = Utils.prototype.Base64._utf8_encode(input);
                while (i < input.length) {
                    chr1 = input.charCodeAt(i++);
                    chr2 = input.charCodeAt(i++);
                    chr3 = input.charCodeAt(i++);
                    enc1 = chr1 >> 2;
                    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                    enc4 = chr3 & 63;
                    if(isNaN(chr2)) {
                        enc3 = enc4 = 64;
                    } else if(isNaN(chr3)) {
                        enc4 = 64;
                    }
                    output = output +
                        this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                        this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
                }
                return output;
            },
            // public method for decoding
            decode: function (input) {
                var output = "";
                var chr1, chr2, chr3;
                var enc1, enc2, enc3, enc4;
                var i = 0;
                input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
                while (i < input.length) {
                    enc1 = this._keyStr.indexOf(input.charAt(i++));
                    enc2 = this._keyStr.indexOf(input.charAt(i++));
                    enc3 = this._keyStr.indexOf(input.charAt(i++));
                    enc4 = this._keyStr.indexOf(input.charAt(i++));
                    chr1 = (enc1 << 2) | (enc2 >> 4);
                    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                    chr3 = ((enc3 & 3) << 6) | enc4;
                    output = output + String.fromCharCode(chr1);
                    if(enc3 != 64) {
                        output = output + String.fromCharCode(chr2);
                    }
                    if(enc4 != 64) {
                        output = output + String.fromCharCode(chr3);
                    }
                }
                output = Utils.prototype.Base64._utf8_decode(output);
                return output;
            },
            // private method for UTF-8 encoding
            _utf8_encode: function (string) {
                string = string.replace(/\r\n/g, "\n");
                var utftext = "";
                for (var n = 0; n < string.length; n++) {
                    var c = string.charCodeAt(n);
                    if(c < 128) {
                        utftext += String.fromCharCode(c);
                    }
                    else if((c > 127) && (c < 2048)) {
                        utftext += String.fromCharCode((c >> 6) | 192);
                        utftext += String.fromCharCode((c & 63) | 128);
                    }
                    else {
                        utftext += String.fromCharCode((c >> 12) | 224);
                        utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                        utftext += String.fromCharCode((c & 63) | 128);
                    }
                }
                return utftext;
            },
            // private method for UTF-8 decoding
            _utf8_decode: function (utftext) {
                var string = "";
                var i = 0;
                var c = c1 = c2 = 0;
                while (i < utftext.length) {
                    c = utftext.charCodeAt(i);
                    if(c < 128) {
                        string += String.fromCharCode(c);
                        i++;
                    }
                    else if((c > 191) && (c < 224)) {
                        c2 = utftext.charCodeAt(i + 1);
                        string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                        i += 2;
                    }
                    else {
                        c2 = utftext.charCodeAt(i + 1);
                        c3 = utftext.charCodeAt(i + 2);
                        string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                        i += 3;
                    }
                }
                return string;
            }
        };

        /*********************************Utils工具类 end*****************************/

        /*********************************UUID类 start********************************/
        function UUID() {
            this.id = this.createUUID();
        }

        UUID.prototype.valueOf = function () {
            return this.id;
        };
        UUID.prototype.toString = function () {
            return this.id;
        };
        UUID.prototype.createUUID = function () {
            var dg = new Date(1582, 10, 15, 0, 0, 0, 0);
            var dc = new Date();
            var t = dc.getTime() - dg.getTime();
            var h = '-';
            var tl = UUID.getIntegerBits(t, 0, 31);
            var tm = UUID.getIntegerBits(t, 32, 47);
            var thv = UUID.getIntegerBits(t, 48, 59) + '1'; // version 1, security version is 2
            var csar = UUID.getIntegerBits(UUID.rand(4095), 0, 7);
            var csl = UUID.getIntegerBits(UUID.rand(4095), 0, 7);

            var n = UUID.getIntegerBits(UUID.rand(8191), 0, 7) +
                UUID.getIntegerBits(UUID.rand(8191), 8, 15) +
                UUID.getIntegerBits(UUID.rand(8191), 0, 7) +
                UUID.getIntegerBits(UUID.rand(8191), 8, 15) +
                UUID.getIntegerBits(UUID.rand(8191), 0, 15); // this last number is two octets long
            return tl + h + tm + h + thv + h + csar + csl + h + n;
        };

        UUID.getIntegerBits = function (val, start, end) {
            var base16 = UUID.returnBase(val, 16);
            var quadArray = new Array();
            var quadString = '';
            var i = 0;
            for (i = 0; i < base16.length; i++) {
                quadArray.push(base16.substring(i, i + 1));
            }
            for (i = Math.floor(start / 4); i <= Math.floor(end / 4); i++) {
                if(!quadArray[i] || quadArray[i] == '') quadString += '0';
                else quadString += quadArray[i];
            }
            return quadString;
        };

        UUID.returnBase = function (number, base) {
            var convert = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
            if(number < base) var output = convert[number];
            else {
                var MSD = '' + Math.floor(number / base);
                var LSD = number - MSD * base;
                if(MSD >= base) var output = this.returnBase(MSD, base) + convert[LSD];
                else var output = convert[MSD] + convert[LSD];
            }
            return output;
        };

        UUID.rand = function (max) {
            return Math.floor(Math.random() * max);
        };
        /*********************************UUID类 end**********************************/

        /*********************************各个对象的实例化 start**********************/
        m_ISAPIProtocol = new ISAPIProtocol();
        m_PSIAProtocol = new PSIAProtocol();
        m_systemInstance = new System();
        m_utilsInc = new Utils();
        /*********************************各个对象的实例化 end************************/

        //生成一个JS载入的时间，用于生成插件的ID
        var m_szInitDate = m_utilsInc.dateFormat(new Date(), "yyyyMMddhhmmss");
        m_szPluginID = "webVideoCtrl" + m_szInitDate;
        m_szPluginName = "webVideoCtrl" + m_szInitDate; //IE和非IE都使用一个标示

        //不支持attachEvent函数的浏览器，要在加载JS文件完成后，就插入事件
        if(typeof window.attachEvent != "object" && m_utilsInc.browser().msie) {
            var ObjectString = "<script for=" + m_szPluginID + " event='GetSelectWndInfo(SelectWndInfo)'>GetSelectWndInfo(SelectWndInfo);</script>";
            ObjectString += "<script for=" + m_szPluginID + " event='ZoomInfoCallback(szZoomInfo)'>ZoomInfoCallback(szZoomInfo);</script>";
            ObjectString += "<script for=" + m_szPluginID + "  event='GetHttpInfo(lID, lpInfo, lReverse)'>GetHttpInfo(lID, lpInfo, lReverse);</script>";
            ObjectString += "<script for=" + m_szPluginID + "  event='PluginEventHandler(iEventType, iParam1, iParam2)'>PluginEventHandler(iEventType, iParam1, iParam2);</script>";
            document.write(ObjectString);
        }
        return this;
    })();

    var NS = window.WebVideoCtrl = WebVideoCtrl;
    NS.version = "1.0.9";
})(this);
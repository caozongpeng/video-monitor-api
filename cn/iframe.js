$(function () {
	
	var oPlugin = {
		iWidth: 300,			// plugin width
		iHeight: 200			// plugin height
	};
	
	// 初始化插件参数及插入插件
	WebVideoCtrl.I_InitPlugin(oPlugin.iWidth, oPlugin.iHeight, {
        bWndFull: true,//是否支持单窗口双击全屏，默认支持 true:支持 false:不支持
        iWndowType: 1,
		cbSelWnd: function (xmlDoc) {
			
		}
	});
	WebVideoCtrl.I_InsertOBJECTPlugin("divPlugin");
});
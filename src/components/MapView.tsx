'use client';

import { useEffect, useRef, useState, useId } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MapPin, AlertTriangle, Globe } from 'lucide-react';

interface MapViewProps {
  lat: number;
  lng: number;
  location?: string;
}

// OpenStreetMap 瓦片源（默认）
const defaultTileLayer = {
  name: 'OpenStreetMap',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: ['a', 'b', 'c'],
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
};

// 高德地图瓦片源（需要用户确认）
const amapTileLayers = [
  {
    name: '高德地图',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    attribution: '&copy; 高德地图',
    requiresConsent: true
  },
  {
    name: '高德卫星',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    attribution: '&copy; 高德地图',
    requiresConsent: true
  }
];

// 其他备用瓦片源（不需要同意）
const backupTileLayers = [
  {
    name: 'CartoDB Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  {
    name: 'CartoDB Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }
];

// 所有可用瓦片源
const allTileLayers = [defaultTileLayer, ...backupTileLayers];

// 标记图标配置
const createCustomIcon = () => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

export default function MapView({ lat, lng, location }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerId = useId();
  const [isClient, setIsClient] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTileIndex, setCurrentTileIndex] = useState(0);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [amapConsentGiven, setAmapConsentGiven] = useState(false);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const pendingSwitchRef = useRef<number | null>(null);

  // 确保只在客户端渲染
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 初始化和清理地图
  useEffect(() => {
    if (!isClient || typeof window === 'undefined') return;

    let timer: number;
    
    const initializeMap = () => {
      const container = document.getElementById(containerId);
      if (!container) {
        timer = requestAnimationFrame(initializeMap);
        return;
      }
      
      if (mapRef.current) return;

      // 创建地图
      const map = L.map(containerId, {
        center: [lat || 39.9042, lng || 116.4074],
        zoom: lat && lng && lat !== 0 && lng !== 0 ? 13 : 2,
        scrollWheelZoom: true,
        preferCanvas: true,
      });

      mapRef.current = map;
      setIsReady(true);

      // 添加默认瓦片图层（OpenStreetMap）
      addTileLayer(map, 0);

      // 监听瓦片错误，自动切换到下一个源（仅限不需要同意的源）
      map.on('tileerror', () => {
        console.warn('瓦片加载失败，尝试切换地图源...');
        // 找到下一个不需要同意的源
        let nextIndex = currentTileIndex + 1;
        while (nextIndex < allTileLayers.length) {
          const nextLayer = allTileLayers[nextIndex];
          if (!('requiresConsent' in nextLayer) || !nextLayer.requiresConsent) {
            break;
          }
          nextIndex++;
        }
        
        if (nextIndex < allTileLayers.length) {
          addTileLayer(map, nextIndex);
        }
      });
    };

    timer = requestAnimationFrame(initializeMap);

    function addTileLayer(map: L.Map, index: number) {
      // 移除旧的瓦片层
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }

      const tileConfig = allTileLayers[index];
      if (!tileConfig) return;

      const tileLayer = L.tileLayer(tileConfig.url, {
        subdomains: 'subdomains' in tileConfig ? tileConfig.subdomains as string[] : ['a', 'b', 'c'],
        attribution: tileConfig.attribution,
        maxZoom: 19,
        crossOrigin: true,
      });

      tileLayer.addTo(map);
      tileLayerRef.current = tileLayer;
      setCurrentTileIndex(index);
    }

    // 清理函数
    return () => {
      cancelAnimationFrame(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
        setIsReady(false);
      }
    };
  }, [isClient, lat, lng, containerId]);

  // 添加标记
  useEffect(() => {
    if (!mapRef.current || !isReady) return;

    const map = mapRef.current;
    const customIcon = createCustomIcon();

    // 清除所有标记
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    // 添加新标记
    if (lat && lng && lat !== 0 && lng !== 0) {
      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      
      const popupContent = location 
        ? `<div style="font-family: system-ui, sans-serif; padding: 4px;">
            <strong style="font-size: 14px; color: #333;">${location}</strong>
            <br/>
            <span style="font-size: 12px; color: #666;">
              ${lat.toFixed(4)}, ${lng.toFixed(4)}
            </span>
           </div>`
        : `<div style="font-family: system-ui, sans-serif;">
            <strong>IP位置</strong>
            <br/>
            <span style="font-size: 12px; color: #666;">
              ${lat.toFixed(4)}, ${lng.toFixed(4)}
            </span>
           </div>`;
      
      marker.bindPopup(popupContent).openPopup();
      map.setView([lat, lng], 13);
    }
  }, [isReady, lat, lng, location]);

  // 处理地图切换请求
  const handleMapSwitch = (targetIndex: number) => {
    // 如果目标是需要同意的地图且用户尚未同意
    if (targetIndex >= allTileLayers.length) {
      // 这是高德地图
      const amapIndex = targetIndex - allTileLayers.length;
      if (!amapConsentGiven) {
        pendingSwitchRef.current = amapIndex;
        setShowConsentDialog(true);
        return;
      }
      // 用户已同意，直接切换到高德地图
      switchToAmap(amapIndex);
    } else {
      // 切换到普通地图源
      switchToDefault(targetIndex);
    }
  };

  // 切换到普通地图源
  const switchToDefault = (index: number) => {
    if (!mapRef.current || !isReady) return;
    
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }

    const tileConfig = allTileLayers[index];
    const tileLayer = L.tileLayer(tileConfig.url, {
      subdomains: 'subdomains' in tileConfig ? tileConfig.subdomains as string[] : ['a', 'b', 'c'],
      attribution: tileConfig.attribution,
      maxZoom: 19,
      crossOrigin: true,
    });

    tileLayer.addTo(mapRef.current);
    tileLayerRef.current = tileLayer;
    setCurrentTileIndex(index);
  };

  // 切换到高德地图
  const switchToAmap = (amapIndex: number) => {
    if (!mapRef.current || !isReady) return;
    
    // 保存当前索引（扩展索引用于表示高德地图）
    const extendedIndex = allTileLayers.length + amapIndex;
    
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }

    const tileConfig = amapTileLayers[amapIndex];
    const tileLayer = L.tileLayer(tileConfig.url, {
      subdomains: tileConfig.subdomains,
      attribution: tileConfig.attribution,
      maxZoom: 19,
      crossOrigin: true,
    });

    tileLayer.addTo(mapRef.current);
    tileLayerRef.current = tileLayer;
    setCurrentTileIndex(extendedIndex);
  };

  // 用户同意使用高德地图
  const handleConsentGiven = () => {
    setAmapConsentGiven(true);
    setShowConsentDialog(false);
    if (pendingSwitchRef.current !== null) {
      switchToAmap(pendingSwitchRef.current);
      pendingSwitchRef.current = null;
    }
  };

  // 用户拒绝使用高德地图
  const handleConsentDenied = () => {
    setShowConsentDialog(false);
    pendingSwitchRef.current = null;
  };

  // 获取当前地图名称
  const getCurrentMapName = () => {
    if (currentTileIndex >= allTileLayers.length) {
      const amapIndex = currentTileIndex - allTileLayers.length;
      return amapTileLayers[amapIndex]?.name || '未知';
    }
    return allTileLayers[currentTileIndex]?.name || 'OpenStreetMap';
  };

  // 获取所有可选地图（仅显示用户可选的）
  const availableMaps = [
    { index: 0, name: 'OpenStreetMap', description: '默认地图源' },
    { index: 1, name: 'CartoDB Positron', description: '简洁风格' },
    { index: 2, name: 'CartoDB Dark', description: '深色主题' },
    { index: allTileLayers.length, name: '高德地图', description: '需要同意' },
    { index: allTileLayers.length + 1, name: '高德卫星', description: '卫星影像' },
  ];

  // 过滤掉高德地图中已同意的地图
  const visibleMaps = availableMaps.filter(map => {
    if (map.index >= allTileLayers.length && amapConsentGiven) {
      return true; // 已同意，显示高德地图选项
    }
    if (map.index >= allTileLayers.length && !amapConsentGiven) {
      return true; // 未同意，只显示选项但不预加载
    }
    return true;
  });

  return (
    <div className="relative w-full h-full">
      <div 
        id={containerId}
        className="w-full h-full rounded-lg"
        style={{ minHeight: '300px' }}
      />
      
      {/* 地图加载提示 */}
      {!isClient || !isReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg z-10">
          <p className="text-muted-foreground text-sm">正在加载地图...</p>
        </div>
      ) : null}
      
      {/* 地图切换器 - 需要pointer-events-auto确保可点击 */}
      {isReady && (
        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-lg shadow-md p-2 z-[1000] space-y-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">地图源:</span>
          </div>
          <Select
            value={String(currentTileIndex)}
            onValueChange={(value) => handleMapSwitch(parseInt(value))}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder={getCurrentMapName()}>
                {getCurrentMapName()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="z-[2000]">
              {visibleMaps.map((map) => (
                <SelectItem 
                  key={map.index} 
                  value={String(map.index)}
                  className="text-xs"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    <span>{map.name}</span>
                    {map.index >= allTileLayers.length && (
                      <span className="text-yellow-500" aria-label="需要同意">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 地图控制说明 */}
      {isReady && (
        <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs text-muted-foreground z-[1000] pointer-events-none opacity-0">
          {getCurrentMapName()} | 滚动缩放 | 拖拽移动
        </div>
      )}

      {/* 高德地图使用同意对话框 */}
      <AlertDialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
        <AlertDialogContent className="max-w-md z-[9999]">
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            切换到高德地图
          </AlertDialogTitle>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>您即将切换到 <strong>高德地图</strong>。切换前请注意以下事项：</p>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 space-y-2">
              <p className="font-medium text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                隐私风险提示
              </p>
              <ul className="text-sm space-y-1 text-yellow-700 dark:text-yellow-300 list-disc list-inside">
                <li>高德地图会收集您的 IP 地址和地理位置查询请求</li>
                <li>这些数据将由高德地图（阿里巴巴集团）存储和处理</li>
                <li>切换后，您对本网站的使用可能会被高德地图记录</li>
              </ul>
            </div>
            
            <p className="text-muted-foreground">
              <strong>推荐：</strong> OpenStreetMap 是开源地图，不追踪用户，提供相同的地图服务。
            </p>
            
            <p className="text-muted-foreground">
              是否确认切换到高德地图？
            </p>
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={handleConsentDenied}>
              取消（保持 OpenStreetMap）
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConsentGiven} className="bg-yellow-600 hover:bg-yellow-700">
              确认切换到高德地图
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

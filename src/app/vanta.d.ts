declare module 'vanta/dist/vanta.net.min' {
    import * as THREE from 'three';
    
    interface VantaNetOptions {
      el: HTMLElement;
      THREE: typeof THREE;
      mouseControls?: boolean;
      touchControls?: boolean;
      gyroControls?: boolean;
      minHeight?: number;
      minWidth?: number;
      scale?: number;
      scaleMobile?: number;
      color?: number;
      backgroundColor?: number;
      points?: number;
      maxDistance?: number;
      spacing?: number;
    }
    
    interface VantaNetEffect {
      destroy: () => void;
    }
    
    function NET(options: VantaNetOptions): VantaNetEffect;
    export default NET;
  }
  
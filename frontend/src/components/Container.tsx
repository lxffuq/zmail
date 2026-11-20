import React, { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

// 共享容器组件，确保一致的宽度（单列仪表盘，收窄到 4xl 更聚焦）
const Container: React.FC<ContainerProps> = ({ children, className = '' }) => {
  return (
    <div className={`max-w-4xl mx-auto px-4 sm:px-6 w-full ${className}`}>
      {children}
    </div>
  );
};

export default Container; 
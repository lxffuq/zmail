import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NotFoundPage: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-xl text-muted-foreground mb-6">{t('errors.notFound')}</p>
      <Link 
        to="/" 
        className="btn-gradient px-5 py-2.5 rounded-full"
      >
        {t('common.back')}
      </Link>
    </div>
  );
};

export default NotFoundPage; 
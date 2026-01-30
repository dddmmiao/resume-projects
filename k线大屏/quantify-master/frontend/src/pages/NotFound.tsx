import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5'
    }}>
      <Result
        status="404"
        title="404"
        subTitle="抱歉，您访问的页面不存在。"
        extra={[
          <Button
            key="home"
            type="primary"
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
            style={{ marginRight: '8px' }}
          >
            返回首页
          </Button>
        ]}
      />
    </div>
  );
};

export default NotFound;

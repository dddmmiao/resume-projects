/**
 * 系统监控面板组件
 */
import React from 'react';
import { Card, Statistic, Progress, Space, Typography, Row, Col, Alert, Tooltip } from 'antd';
import { 
  DatabaseOutlined, 
  StockOutlined, 
  ApartmentOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  HddOutlined,
  DollarOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { MonitorPanelProps } from '../../types/admin';

const { Title } = Typography;

const MonitorPanel: React.FC<MonitorPanelProps> = ({
  statisticsCount,
  systemStatus,
  currentDataSource
}) => {
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  };

  const getCpuColor = (usage: number) => {
    if (usage < 50) return '#52c41a';
    if (usage < 80) return '#faad14';
    return '#f5222d';
  };

  const getMemoryColor = (usage: number) => {
    if (usage < 60) return '#52c41a';
    if (usage < 85) return '#faad14';
    return '#f5222d';
  };

  const getDiskColor = (usage: number) => {
    if (usage < 70) return '#52c41a';
    if (usage < 90) return '#faad14';
    return '#f5222d';
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 系统资源监控 */}
        <div style={{ marginTop: '0' }}>
          <Title level={5} style={{ marginTop: '0', marginBottom: '12px' }}>
            <ThunderboltOutlined /> 系统资源
          </Title>
          <Row gutter={16}>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="CPU使用率"
                  value={systemStatus.cpu}
                  suffix="%"
                  valueStyle={{ color: getCpuColor(systemStatus.cpu) }}
                  prefix={<ThunderboltOutlined />}
                />
                <Progress
                  percent={systemStatus.cpu}
                  strokeColor={getCpuColor(systemStatus.cpu)}
                  showInfo={false}
                  size="small"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title={
                    <Space>
                      <span>内存使用率</span>
                      <Tooltip title="内存使用率：系统当前使用的内存占可用内存的百分比。高内存使用率可能导致系统变慢，建议及时释放内存。">
                        <InfoCircleOutlined style={{ fontSize: '12px', color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  value={systemStatus.memory}
                  suffix="%"
                  valueStyle={{ color: getMemoryColor(systemStatus.memory) }}
                  prefix={<HddOutlined />}
                />
                <Progress
                  percent={systemStatus.memory}
                  strokeColor={getMemoryColor(systemStatus.memory)}
                  showInfo={false}
                  size="small"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title={
                    <Space>
                      <span>磁盘使用率</span>
                      <Tooltip title="磁盘使用率：系统当前使用的磁盘空间占可用磁盘空间的百分比。高磁盘使用率可能导致系统无法正常运行，建议及时清理磁盘空间。">
                        <InfoCircleOutlined style={{ fontSize: '12px', color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  value={systemStatus.disk}
                  suffix="%"
                  valueStyle={{ color: getDiskColor(systemStatus.disk) }}
                  prefix={<DatabaseOutlined />}
                />
                <Progress
                  percent={systemStatus.disk}
                  strokeColor={getDiskColor(systemStatus.disk)}
                  showInfo={false}
                  size="small"
                />
              </Card>
            </Col>

          </Row>
        </div>

        {/* 系统运行状态 */}
        <div>
          <Title level={5}>
            <ClockCircleOutlined /> 系统状态
          </Title>
          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="系统运行时间"
                  value={formatUptime(systemStatus.uptime)}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="前端服务"
                  value="运行中"
                  prefix={<ThunderboltOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="后端服务"
                  value="运行中"
                  prefix={<DatabaseOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="数据源"
                  value={currentDataSource || '未知'}
                  prefix={<DatabaseOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
          </Row>
        </div>

        {/* 数据统计 */}
        <div>
          <Title level={5}>
            <DatabaseOutlined /> 数据统计
          </Title>
          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="股票数量"
                  value={statisticsCount.stock}
                  prefix={<StockOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="可转债数量"
                  value={statisticsCount.convertible_bond}
                  prefix={<DollarOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="概念数量"
                  value={statisticsCount.concept}
                  prefix={<BulbOutlined />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="行业数量"
                  value={statisticsCount.industry}
                  prefix={<ApartmentOutlined />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
          </Row>
        </div>

        {/* 系统告警 */}
        {(systemStatus.cpu > 80 || systemStatus.memory > 85 || systemStatus.disk > 90) && (
          <div>
            <Title level={5}>系统告警</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              {systemStatus.cpu > 80 && (
                <Alert
                  message="CPU使用率过高"
                  description={`当前CPU使用率为 ${systemStatus.cpu}%，建议检查系统负载`}
                  type="warning"
                  showIcon
                />
              )}
              {systemStatus.memory > 85 && (
                <Alert
                  message="内存使用率过高"
                  description={`当前内存使用率为 ${systemStatus.memory}%，建议释放内存或增加内存`}
                  type="warning"
                  showIcon
                />
              )}
              {systemStatus.disk > 90 && (
                <Alert
                  message="磁盘使用率过高"
                  description={`当前磁盘使用率为 ${systemStatus.disk}%，建议清理磁盘空间`}
                  type="error"
                  showIcon
                />
              )}
            </Space>
          </div>
        )}
      </Space>
    </div>
  );
};

export default MonitorPanel;

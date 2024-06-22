import { Stack, StackProps } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as iam from 'aws-cdk-lib/aws-iam'; 
export class AwsCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // VPCの作成
    const vpc = new ec2.Vpc(this, 'MyVPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'MyPublicSubnet',
          cidrMask: 24
        },
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: 'MyPrivateSubnet',
          cidrMask: 24
        }
      ]
    });
    
    // セキュリティグループの作成
    const securityGroup = new ec2.SecurityGroup(this, 'MySecurityGroup', {
      vpc: vpc,
      description: 'Allow all outbound traffic by default',
      allowAllOutbound: true // すべてのアウトバウンドトラフィックを許可（デフォルト）
    });
    // インバウンドルールの追加例 (80番ポートを許可する)
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow SSH access from the world');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8080), 'allow access to test listener');
    // Application Load Balancerの作成
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'BlueGreenALB', {
      vpc: vpc,
      internetFacing: true, // 公開向け
      loadBalancerName: 'bluegreen-alb',
      securityGroup: securityGroup, // 既に作成したセキュリティグループを使用
    });
    // Target Groupの作成
    const targetGroupBlueFrontend = new elbv2.ApplicationTargetGroup(this, 'BlueTargetFrontend', {
      vpc: vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.IP,
      targetGroupName: "BlueTargetFrontend",
    });
    const targetGroupGreenFrontend = new elbv2.ApplicationTargetGroup(this, 'GreenTargetFrontend', {
      vpc: vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.IP,
      targetGroupName: "GreenTargetFrontend",
    });
    const targetGroupBlueBackend = new elbv2.ApplicationTargetGroup(this, 'BlueTargetBackend', {
      vpc: vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.IP,
      targetGroupName: "BlueTargetBackend",
    });
    const targetGroupGreenBackend = new elbv2.ApplicationTargetGroup(this, 'GreenTargetBackend', {
      vpc: vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.IP,
      targetGroupName: "GreenTargetBackend",
    });
    
    // ALBにHTTPリスナーを追加して、トラフィックをTarget Groupに転送する
    const bglistener = loadBalancer.addListener('ListenerGreen', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroupBlueFrontend]),
    });
    // テスト用のリスナーを追加する
    const testListener = loadBalancer.addListener('TestListener', {
      port: 8080, // 8080というテストポートを使用します。必要に応じて変更できます。
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroupGreenFrontend]), // Greenのターゲットグループに転送
    });
    // ECSクラスタの作成
    const cluster = new ecs.Cluster(this, 'BlueGreenCluster', {
      clusterName: 'tutorial-bluegreen-cluster',
      vpc: vpc,
    });
    // ECSタスク定義の作成
    const taskDefinitionFrontend = new ecs.FargateTaskDefinition(this, 'TutorialTaskDefFrontend', {
      memoryLimitMiB: 512, // 必要なメモリを指定してください
      cpu: 256,            // 必要なCPUを指定してください
    });
    const taskDefinitionBackend = new ecs.FargateTaskDefinition(this, 'TutorialTaskDefBackend', {
      memoryLimitMiB: 512, // 必要なメモリを指定してください
      cpu: 256,            // 必要なCPUを指定してください
    });
    // ECRリポジトリからコンテナイメージを取得。ecs-tutorialという名前のリポジトリで指定
    const containerImageFrontend = ecs.ContainerImage.fromEcrRepository(ecr.Repository.fromRepositoryName(this, 'RepoFrontend', 'frontend-app'));
    const containerImageBackend = ecs.ContainerImage.fromEcrRepository(ecr.Repository.fromRepositoryName(this, 'RepoBackend', 'backend-app'));
    const containerFrontend = taskDefinitionFrontend.addContainer('sample-app-frontend', {
      image: containerImageFrontend,
      memoryLimitMiB: 512,
    });
    const containerBackend = taskDefinitionBackend.addContainer('sample-app-backend', {
      image: containerImageBackend,
      memoryLimitMiB: 512,
    });
    containerFrontend.addPortMappings({
      containerPort: 80
    });
    containerBackend.addPortMappings({
      containerPort: 80
    });
    // ECSサービスの作成（Fargateサービス）
    const ecsFargateServiceFrontend = new ecs.FargateService(this, 'FargateServiceFrontend', {
      cluster: cluster,
      taskDefinition: taskDefinitionFrontend,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [securityGroup],
      vpcSubnets: {
        // 必要なサブネットを指定してください
        subnetType: ec2.SubnetType.PUBLIC,
      },
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      platformVersion: ecs.FargatePlatformVersion.LATEST,
    });
    const ecsFargateServiceBackend = new ecs.FargateService(this, 'FargateServiceBackend', {
      cluster: cluster,
      taskDefinition: taskDefinitionBackend,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [securityGroup],
      vpcSubnets: {
        // 必要なサブネットを指定してください
        subnetType: ec2.SubnetType.PUBLIC,
      },
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      platformVersion: ecs.FargatePlatformVersion.LATEST,
    });
    // タスクをTarget Groupに関連付け
    targetGroupBlueFrontend.addTarget(ecsFargateServiceFrontend);
    targetGroupBlueBackend.addTarget(ecsFargateServiceBackend);

    new elbv2.ApplicationListenerRule(
      this,
      `blue-frontend`,
      {
        priority: 1,
        listener: bglistener,
        targetGroups: [targetGroupBlueFrontend],
        conditions: [elbv2.ListenerCondition.pathPatterns(["/frontend"])],
      },
    );
    new elbv2.ApplicationListenerRule(
      this,
      `blue-backend`,
      {
        priority: 1,
        listener: bglistener,
        targetGroups: [targetGroupBlueBackend],
        conditions: [elbv2.ListenerCondition.pathPatterns(["/api/*"])],
      },
    );

    new elbv2.ApplicationListenerRule(
      this,
      `green-frontend`,
      {
        priority: 1,
        listener: testListener,
        targetGroups: [targetGroupGreenFrontend],
        conditions: [elbv2.ListenerCondition.pathPatterns(["/frontend"])],
      },
    );
    new elbv2.ApplicationListenerRule(
      this,
      `green-backend`,
      {
        priority: 1,
        listener: testListener,
        targetGroups: [targetGroupGreenBackend],
        conditions: [elbv2.ListenerCondition.pathPatterns(["/api/*"])],
      },
    );

    // CodeDeployの定義
    const application = new codedeploy.EcsApplication(this, 'BlueGreenApp', {
      applicationName: 'tutorial-bluegreen-app',
    });
    // IAM Roleの作成
    const ecsCodeDeployRole = new iam.Role(this, 'EcsCodeDeployRole', {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
    });
    // デプロイグループの作成
    new codedeploy.EcsDeploymentGroup(this, 'BlueGreenDGFrontend', {
      application: application,
      deploymentGroupName: "tutorial-bluegreen-dg",
      service: ecsFargateServiceFrontend,  
      blueGreenDeploymentConfig: {
        blueTargetGroup: targetGroupBlueFrontend,
        greenTargetGroup: targetGroupGreenFrontend,
        listener: bglistener,
        testListener: testListener, 
        deploymentApprovalWaitTime: cdk.Duration.minutes(30),  // Greenへの切り替わりを30分待機
        terminationWaitTime: cdk.Duration.minutes(10) // 新しいタスクの開始後、古いタスクの停止までの待機時間
      },
      role: ecsCodeDeployRole,
    });

    new codedeploy.EcsDeploymentGroup(this, 'BlueGreenDGBackend', {
      application: application,
      deploymentGroupName: "tutorial-bluegreen-dg",
      service: ecsFargateServiceBackend,  
      blueGreenDeploymentConfig: {
        blueTargetGroup: targetGroupBlueBackend,
        greenTargetGroup: targetGroupGreenBackend,
        listener: bglistener,
        testListener: testListener, 
        deploymentApprovalWaitTime: cdk.Duration.minutes(30),  // Greenへの切り替わりを30分待機
        terminationWaitTime: cdk.Duration.minutes(10) // 新しいタスクの開始後、古いタスクの停止までの待機時間
      },
      role: ecsCodeDeployRole,
    });
    
    // CodeDeployのアプリケーションとデプロイグループの参照
    const app = codedeploy.ServerApplication.fromServerApplicationName(this, 'ExistingApp', 'tutorial-bluegreen-app');
    const deploymentGroup = codedeploy.ServerDeploymentGroup.fromServerDeploymentGroupAttributes(this, 'ExistingDG', {
      application: app,
      deploymentGroupName: 'tutorial-bluegreen-dg',
    });
  }
}
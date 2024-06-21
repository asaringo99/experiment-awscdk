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
    const targetGroupBlue = new elbv2.ApplicationTargetGroup(this, 'BlueTarget', {
      vpc: vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.IP,
      targetGroupName: "BlueTarget",
    });
    const targetGroupGreen = new elbv2.ApplicationTargetGroup(this, 'GreenTarget', {
      vpc: vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.IP,
      targetGroupName: "GreenTarget",
    });
    
    // ALBにHTTPリスナーを追加して、トラフィックをTarget Groupに転送する
    const bglistener = loadBalancer.addListener('ListenerGreen', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroupBlue]),
    });
    // テスト用のリスナーを追加する
    const testListener = loadBalancer.addListener('TestListener', {
      port: 8080, // 8080というテストポートを使用します。必要に応じて変更できます。
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroupGreen]), // Greenのターゲットグループに転送
    });
    // ECSクラスタの作成
    const cluster = new ecs.Cluster(this, 'BlueGreenCluster', {
      clusterName: 'tutorial-bluegreen-cluster',
      vpc: vpc,
    });
    // ECSタスク定義の作成
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TutorialTaskDef', {
      memoryLimitMiB: 512, // 必要なメモリを指定してください
      cpu: 256,            // 必要なCPUを指定してください
      
    });
    // ECRリポジトリからコンテナイメージを取得。ecs-tutorialという名前のリポジトリで指定
    const containerImage = ecs.ContainerImage.fromEcrRepository(ecr.Repository.fromRepositoryName(this, 'Repo', 'ecs-tutorial'));
    const container = taskDefinition.addContainer('sample-app', {
      image: containerImage,
      memoryLimitMiB: 512,
      // command: [
      //   "/bin/sh",
      //   "-c",
      //   "echo 'hello world'",
      //   "echo '<html> <head> <title>Amazon ECS Sample App</title> <style>body {margin-top: 40px; background-color: #00FFFF;} </style> </head><body> <div style=color:white;text-align:center> <h1>Amazon ECS Sample App</h1> <h2>Congratulations!</h2> <p>Your application is now running on a container in Amazon ECS.</p> </div></body></html>' > /usr/local/apache2/htdocs/index.html && httpd-foreground",
      //   "echo '<html> <head> <title>Amazon ECS Sample App</title> <style>body {margin-top: 40px; background-color: #097969;} </style> </head><body> <div style=color:white;text-align:center> <h1>Amazon ECS Sample App</h1> <h2>Congratulations!</h2> <p>Your application is now running on a container in Amazon ECS.</p> </div></body></html>' > /usr/local/apache2/htdocs/index.html && httpd-foreground"
      // ]
    });
    container.addPortMappings({
      containerPort: 80
    });
    // ECSサービスの作成（Fargateサービス）
    const ecsFargateService = new ecs.FargateService(this, 'FargateService', {
      cluster: cluster,
      taskDefinition: taskDefinition,
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
    const ecsFargateServiceAutoScaling = ecsFargateService.autoScaleTaskCount({
      maxCapacity: 2,
      minCapacity: 1
    })
    ecsFargateServiceAutoScaling.scaleOnMemoryUtilization("scale-memory-ave", {
      targetUtilizationPercent: 40,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    })
    // タスクをTarget Groupに関連付け
    targetGroupBlue.addTarget(ecsFargateService);
    // CodeDeployの定義
    const application = new codedeploy.EcsApplication(this, 'BlueGreenApp', {
      applicationName: 'tutorial-bluegreen-app',
    });
    // IAM Roleの作成
    const ecsCodeDeployRole = new iam.Role(this, 'EcsCodeDeployRole', {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
    });
    // デプロイグループの作成
    new codedeploy.EcsDeploymentGroup(this, 'BlueGreenDG', {
      application: application,
      deploymentGroupName: "tutorial-bluegreen-dg",
      service: ecsFargateService,  
      blueGreenDeploymentConfig: {
        blueTargetGroup: targetGroupBlue,
        greenTargetGroup: targetGroupGreen,
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
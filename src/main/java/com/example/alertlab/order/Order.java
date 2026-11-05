package com.example.alertlab.order;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 40)
    private String orderNo;

    @Column(nullable = false)
    private String productName;

    @Column(nullable = false)
    private int quantity;

    // 의도적으로 nullable — NPE 시나리오에서 사용
    private String memo;

    protected Order() {
    }

    public Order(String orderNo, String productName, int quantity, String memo) {
        this.orderNo = orderNo;
        this.productName = productName;
        this.quantity = quantity;
        this.memo = memo;
    }

    public void changeQuantity(int quantity) {
        this.quantity = quantity;
    }

    public Long getId() {
        return id;
    }

    public String getOrderNo() {
        return orderNo;
    }

    public String getProductName() {
        return productName;
    }

    public int getQuantity() {
        return quantity;
    }

    public String getMemo() {
        return memo;
    }
}
